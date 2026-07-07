require("dotenv").config();

const url = process.env.SUPABASE_URL;
console.log("URL length:", url.length);
console.log("Starts with https:// :", url.startsWith("https://"));
console.log("Ends with .supabase.co :", url.endsWith(".supabase.co"));
console.log("Has trailing slash :", url.endsWith("/"));