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
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function searchMemories(query) {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .is("deleted_at", null)
    .or( 
    title.ilike.%${query}%,summary.ilike.%${query}%,collection.ilike.%${query}%,tags.cs.{${query}}
    )

    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

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

async function trashMemory(id) {
  const { data, error } = await supabase
    .from("memories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data[0];
}

async function restoreMemory(id) {
  const { data, error } = await supabase
    .from("memories")
    .update({ deleted_at: null })
    .eq("id", id)
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data[0];
}

async function getTrashedMemories() {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function permanentlyDeleteMemory(id) {
  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  return { id };
}

module.exports = {
  supabase,
  saveMemory,
  getAllMemories,
  updateMemory,
  trashMemory,
  restoreMemory,
  getTrashedMemories,
  permanentlyDeleteMemory,
  searchMemories
};