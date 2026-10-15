// Run locally with Node 22+. Do not commit, email, or publish generated credentials.
import {randomBytes,scryptSync} from "node:crypto";
const password=randomBytes(24).toString("base64url");
const salt=randomBytes(16);
const derived=scryptSync(password,salt,32,{N:16384,r:8,p:1});
const sessionSecret=randomBytes(48).toString("base64url");
console.log("Initial password (copy privately and rotate after first login):",password);
console.log("PROSPECT_ADMIN_PASSWORD_SCRYPT="+salt.toString("hex")+":"+derived.toString("hex"));
console.log("PROSPECT_SESSION_SECRET="+sessionSecret);
console.log("Set PROSPECT_ADMIN_EMAIL to your own email in Railway.");
console.log("Secrets are not saved by this utility.");
