"""COMVERXA P0 staging-only transactional inbox/outbox bridge.
Call after webhook signature verification and after resolving channel on server.
No direct WhatsApp network calls or production migration.
"""
import sqlite3
import uuid

class OmnichannelBridge:
    def __init__(self, db):
        self.db = db
        self.db.execute("PRAGMA foreign_keys=ON")

    def ingest_verified(self, tenant_id, channel_id, provider_id, phone, direction, kind, body, at):
        if not all(isinstance(v, str) and v for v in (tenant_id, channel_id, provider_id, phone, direction, kind, at)):
            raise ValueError("Invalid event")
        if not (phone.isascii() and phone.isdecimal() and 10 <= len(phone) <= 15):
            raise ValueError("Invalid recipient")
        if not isinstance(body, str) or len(body) > 4000:
            raise ValueError("Invalid body")
        with self.db:
            channel = self.db.execute(
                "SELECT 1 FROM omnichannel_channels WHERE tenant_id=? AND id=?",
                (tenant_id, channel_id)).fetchone()
            if channel is None:
                raise ValueError("Unknown channel")
            if self.db.execute(
                "SELECT 1 FROM omnichannel_messages WHERE tenant_id=? AND channel_id=? AND provider_message_id=?",
                (tenant_id, channel_id, provider_id)).fetchone():
                return {"inserted": False}
            row = self.db.execute(
                "SELECT id FROM omnichannel_conversations WHERE tenant_id=? AND channel_id=? AND phone=?",
                (tenant_id, channel_id, phone)).fetchone()
            conversation_id = row[0] if row else uuid.uuid4().hex
            if row is None:
                self.db.execute(
                    "INSERT INTO omnichannel_conversations (tenant_id,id,channel_id,phone,last_at) VALUES (?,?,?,?,?)",
                    (tenant_id, conversation_id, channel_id, phone, at))
            self.db.execute(
                """INSERT INTO omnichannel_messages
                (tenant_id,id,conversation_id,channel_id,provider_message_id,direction,kind,body,occurred_at)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (tenant_id, uuid.uuid4().hex, conversation_id, channel_id, provider_id, direction, kind, body, at))
            self.db.execute(
                "UPDATE omnichannel_conversations SET last_at=? WHERE tenant_id=? AND id=? AND last_at < ?",
                (at, tenant_id, conversation_id, at))
            return {"inserted": True, "conversation_id": conversation_id}

    def queue_text(self, tenant_id, conversation_id, request_id, text):
        """Transactional deduplication: queue only, never send directly.
        Replaying a request_id with different data raises an error.
        """
        if not all(isinstance(v, str) and v for v in (tenant_id, conversation_id, request_id, text)):
            raise ValueError("Invalid request")
        if not 1 <= len(text) <= 4000:
            raise ValueError("Invalid text")
        with self.db:
            old = self.db.execute(
                "SELECT conversation_id,body,state FROM omnichannel_outbox WHERE tenant_id=? AND request_id=?",
                (tenant_id, request_id)).fetchone()
            if old:
                if (old[0], old[1]) != (conversation_id, text):
                    raise ValueError("Idempotency key conflict")
                return {"queued": False, "state": old[2]}
            convo = self.db.execute(
                "SELECT channel_id FROM omnichannel_conversations WHERE tenant_id=? AND id=?",
                (tenant_id, conversation_id)).fetchone()
            if convo is None:
                raise ValueError("Conversation unavailable")
            self.db.execute(
                """INSERT INTO omnichannel_outbox
                (tenant_id,request_id,conversation_id,channel_id,body,state)
                VALUES (?,?,?,?,?,'queued')""",
                (tenant_id, request_id, conversation_id, convo[0], text))
            return {"queued": True, "state": "queued"}
