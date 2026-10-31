/**
 * Starts the isolated COMVERXA Premium Commercial pilot.
 * Required: CVX_COM_DB_PATH, CVX_COM_ADMIN_EMAIL, CVX_COM_ADMIN_PASSWORD.
 * Run behind HTTPS; do not point at the existing Railway production volume.
 */
import {createPremiumServer} from "./commercial-premium-server.mjs";
import {createRecoveryMailer} from "./commercial-premium-mail.mjs";
const env=process.env;
const port=Number(env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error("Invalid PORT");
const configured=env.CVX_OFFSITE_BACKUP_ENABLED==="1";
const required=["CVX_S3_ENDPOINT","CVX_S3_BUCKET","CVX_S3_REGION","CVX_S3_ACCESS_KEY_ID","CVX_S3_SECRET_ACCESS_KEY","CVX_BACKUP_ENCRYPTION_KEY"];
if(configured&&required.some(name=>!env[name]))throw Error("Incomplete offsite-backup configuration");
const offsiteBackupConfig=configured?{
 endpoint:env.CVX_S3_ENDPOINT,bucket:env.CVX_S3_BUCKET,region:env.CVX_S3_REGION,
 accessKeyId:env.CVX_S3_ACCESS_KEY_ID,secretAccessKey:env.CVX_S3_SECRET_ACCESS_KEY,
 encryptionKey:env.CVX_BACKUP_ENCRYPTION_KEY,urlStyle:env.CVX_S3_STYLE||"path"
}:null;
const sendRecoveryEmail=env.CVX_COM_RESEND_API_KEY&&env.CVX_COM_EMAIL_FROM?createRecoveryMailer({
 apiKey:env.CVX_COM_RESEND_API_KEY,from:env.CVX_COM_EMAIL_FROM
}):null;
const stripeRequested=env.CVX_STRIPE_TEST_ENABLED==="1";
const stripeNames=["CVX_STRIPE_TEST_SECRET_KEY","CVX_STRIPE_TEST_WEBHOOK_SECRET"];
if(stripeRequested&&stripeNames.some(key=>!env[key]))throw Error("Stripe TEST configuration missing");
const stripePrices={
 starter:env.CVX_STRIPE_TEST_PRICE_STARTER,
 professional:env.CVX_STRIPE_TEST_PRICE_PROFESSIONAL,
 business:env.CVX_STRIPE_TEST_PRICE_BUSINESS
};
const stripeAnnual={
 starter:env.CVX_STRIPE_TEST_PRICE_STARTER_ANNUAL,
 professional:env.CVX_STRIPE_TEST_PRICE_PROFESSIONAL_ANNUAL,
 business:env.CVX_STRIPE_TEST_PRICE_BUSINESS_ANNUAL
};
if(stripeRequested&&![...Object.values(stripePrices),...Object.values(stripeAnnual)].some(Boolean))throw Error("Stripe test plan prices missing");
const stripeConfig=stripeRequested?{
 secretKey:env.CVX_STRIPE_TEST_SECRET_KEY,webhookSecret:env.CVX_STRIPE_TEST_WEBHOOK_SECRET,
 priceIds:stripePrices,priceIdsAnnual:stripeAnnual
}:null;
const whatsAppConfig=env.CVX_WA_ENCRYPTION_KEY?{
 credentialKey:env.CVX_WA_ENCRYPTION_KEY,
 evolutionUrl:env.CVX_WA_EVOLUTION_URL||"",
 evolutionApiKey:env.CVX_WA_EVOLUTION_API_KEY||"",
 metaAppSecret:env.CVX_WA_META_APP_SECRET||"",
 metaGraphVersion:env.CVX_WA_META_GRAPH_VERSION||"v23.0"
}:null;
const app=createPremiumServer({
 dbPath:env.CVX_COM_DB_PATH,
 bootstrapEmail:env.CVX_COM_ADMIN_EMAIL,
 bootstrapPassword:env.CVX_COM_ADMIN_PASSWORD,
 bootstrapTenant:env.CVX_COM_TENANT||"pilot-empresa",
 enablePlatformMaster:env.CVX_COM_ENABLE_MASTER==="1",
 cookieSecure:env.CVX_COM_COOKIE_INSECURE_LOCAL_ONLY!=="1",
 offsiteBackupConfig,backupSchedule:configured,
 publicOrigin:env.CVX_COM_PUBLIC_ORIGIN||"https://comverxa-comercial-piloto-production.up.railway.app",sendRecoveryEmail,stripeConfig,whatsAppConfig
});
app.server.listen(port,"0.0.0.0",()=>console.log("COMVERXA Premium isolated pilot listening on PORT",port));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>app.server.close(()=>{app.db.close();process.exit(0)}));
