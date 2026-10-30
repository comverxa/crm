/**
 * Starts the isolated COMVERXA Premium Commercial pilot.
 * Required: CVX_COM_DB_PATH, CVX_COM_ADMIN_EMAIL, CVX_COM_ADMIN_PASSWORD.
 * Run behind HTTPS; do not point at the existing Railway production volume.
 */
import {createPremiumServer} from "./commercial-premium-server.mjs";
const env=process.env;
const port=Number(env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error("Invalid PORT");
const app=createPremiumServer({
 dbPath:env.CVX_COM_DB_PATH,
 bootstrapEmail:env.CVX_COM_ADMIN_EMAIL,
 bootstrapPassword:env.CVX_COM_ADMIN_PASSWORD,
 bootstrapTenant:env.CVX_COM_TENANT||"pilot-empresa",
 enablePlatformMaster:env.CVX_COM_ENABLE_MASTER==="1",
 cookieSecure:env.CVX_COM_COOKIE_INSECURE_LOCAL_ONLY!=="1"
});
app.server.listen(port,"0.0.0.0",()=>console.log("COMVERXA Premium isolated pilot listening on PORT",port));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>app.server.close(()=>{app.db.close();process.exit(0)}));
