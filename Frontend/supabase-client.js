/* =========================================================
   SUPABASE CLIENT (frontend)
   -----------------------------------------------------------
   How to get these two values:
   1. Go to supabase.com -> your project -> Project Settings -> API
   2. Copy the "Project URL" -> paste into SUPABASE_URL
   3. Copy the "anon public" key -> paste into SUPABASE_ANON_KEY

   IMPORTANT: only ever use the "anon public" key here.
   Never put your "service_role" key (the one your backend
   .env uses) in any frontend file - that one is secret and
   can bypass all security rules if leaked.
========================================================= */
const SUPABASE_URL = "https://gyqxfddjvfdbiflqmcvu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5cXhmZGRqdmZkYmlmbHFtY3Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMjg4MDYsImV4cCI6MjA5ODgwNDgwNn0.f_LMSCAOEFmG5NOPrD-WN5n74QxCT5XyXdXXGa9ekSc";

const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
