require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function saveMemory(memoryData) {
  const { data, error } = await supabase
    .from("memories")
    .insert([memoryData])
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data[0];
}

async function getAllMemories() {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

module.exports = { supabase, saveMemory, getAllMemories };

async function updateMemory(id, updates) {
  const { data, error } = await supabase
    .from("memories")
    .update(updates)
    .eq("id", id)
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data[0];
}

module.exports = { supabase, saveMemory, getAllMemories, updateMemory };