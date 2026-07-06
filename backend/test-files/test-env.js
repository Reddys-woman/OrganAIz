require("dotenv").config();

console.log("SUPABASE_URL loaded:", !!process.env.SUPABASE_URL);
console.log("SUPABASE_KEY loaded:", !!process.env.SUPABASE_KEY);