"""COMVERXA: SQLite staging repository for inbound WhatsApp events.
Development-only; does not connect to or migrate the production CRM.
SQL parameters are bound; caller must authenticate and supply the tenant scope.
"""
import sqlite3
import uuid

class InboxRepository:
    def __init__(self, connection):
        self.db = connection
        self.db.execute("PRAGMA foreign_keys=ON")

    def register_channel(self, tenant_id, channel_id, slot, provider, external_id):
        if not all(isinstance(s, str) and s for s in (tenant_id, channel_id, provider, external_id)):
            raise ValueError("Invalid channel")
        with self.db:
            self.db.execute(
                "INSERT INTO omnichannel_channels(tenant_id,id,slot,provider,external_id) VALUES (?,?,?,?,?)",
                (tenant_id, channel_id, slot, provider, external_id))

    def receive(self, tenant_id, channel_id, provider_message_id, phone,
                direction, kind, body, occurred_at):
        """Transactionally de-duplicate and persist an inbound/provider event.
        Returns True when newly inserted. Never returns another tenant's data.
        """
        if not all(isinstance(v, str) and v for v in
                   (tenant_id, channel_id, provider_message_id, phone, direction, kind, occurred_at)):
            raise ValueError("Invalid message")
        if not phone.isdecimal() or not 10 <= len(phone) <= 15:
            raise ValueError("Invalid phone")
        if not isinstance(body, str) or len(body) > 4000:
            raise ValueError("Invalid body")
        with self.db:
            exists = self.db.execute(
                "SELECT 1 FROM omnichannel_channels WHERE tenant_id=? AND id=?",
                (tenant_id, channel_id)).fetchone()
            if exists is None:
                raise ValueError("Channel unavailable")
            previous = self.db.execute(
                "SELECT 1 FROM omnichannel_messages WHERE tenant_id=? AND channel_id=? AND provider_message_id=?",
                (tenant_id, channel_id, provider_message_id)).fetchone()
            if previous:
                return False
            conversation = self.db.execute(
                "SELECT id FROM omnichannel_conversations WHERE tenant_id=? AND channel_id=? AND phone=?",
                (tenant_id, channel_id, phone)).fetchone()
            if conversation:
                conversation_id = conversation[0]
            else:
                conversation_id = uuid.uuid4().hex
                self.db.execute(
                    "INSERT INTO omnichannel_conversations(tenant_id,id,channel_id,phone,last_at) VALUES (?,?,?,?,?)",
                    (tenant_id, conversation_id, channel_id, phone, occurred_at))
            self.db.execute(
                """INSERT INTO omnichannel_messages
                (tenant_id,id,conversation_id,channel_id,provider_message_id,direction,kind,body,occurred_at)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (tenant_id, uuid.uuid4().hex, conversation_id, channel_id,
                 provider_message_id, direction, kind, body, occurred_at))
            self.db.execute(
                "UPDATE omnichannel_conversations SET last_at=? WHERE tenant_id=? AND id=? AND last_at<?",
                (occurred_at, tenant_id, conversation_id, occurred_at))
            return True

    def conversations(self, tenant_id):
        return self.db.execute(
            """SELECT id,channel_id,phone,assigned_to,last_at
            FROM omnichannel_conversations WHERE tenant_id=? ORDER BY last_at DESC""",
            (tenant_id,)).fetchall()

    def history(self, tenant_id, conversation_id, limit=100):
        if not isinstance(limit, int) or not 1 <= limit <= 500:
            raise ValueError("Invalid limit")
        return self.db.execute(
            """SELECT provider_message_id,direction,kind,body,occurred_at
            FROM omnichannel_messages WHERE tenant_id=? AND conversation_id=?
            ORDER BY occurred_at DESC,created_at DESC,id DESC LIMIT ?""",
            (tenant_id, conversation_id, limit)).fetchall()
