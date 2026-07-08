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
      `title.ilike.%${query}%,summary.ilike.%${query}%,collection.ilike.%${query}%`
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

const stringSimilarity = require("string-similarity");

async function findDuplicates() {
  const memories = await getAllMemories();

  const duplicateGroups = [];
  const alreadyGrouped = new Set();

  for (let i = 0; i < memories.length; i++) {
    if (alreadyGrouped.has(memories[i].id)) continue;

    const group = [memories[i]];

    for (let j = i + 1; j < memories.length; j++) {
      if (alreadyGrouped.has(memories[j].id)) continue;

      const similarity = stringSimilarity.compareTwoStrings(
        memories[i].title.toLowerCase(),
        memories[j].title.toLowerCase()
      );

      if (similarity > 0.6) {
        group.push(memories[j]);
        alreadyGrouped.add(memories[j].id);
      }
    }

    if (group.length > 1) {
      alreadyGrouped.add(memories[i].id);
      duplicateGroups.push(group);
    }
  }

  return duplicateGroups;
}

async function getUpcomingDeadlines() {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .is("deleted_at", null)
    .not("deadline", "is", null)
    .gte("deadline", new Date().toISOString().split("T")[0])
    .order("deadline", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getCollectionSuggestions() {
  const memories = await getAllMemories();

  const tagCounts = {};
  const tagToMemories = {};

  memories.forEach(memory => {
    (memory.tags || []).forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      if (!tagToMemories[tag]) tagToMemories[tag] = [];
      tagToMemories[tag].push(memory);
    });
  });

  const existingCollections = new Set(memories.map(m => m.collection));

  const suggestions = [];
  for (const tag in tagCounts) {
    if (tagCounts[tag] >= 2 && !existingCollections.has(tag)) {
      suggestions.push({
        tag: tag,
        count: tagCounts[tag],
        memoryIds: tagToMemories[tag].map(m => m.id)
      });
    }
  }

  suggestions.sort((a, b) => b.count - a.count);

  return suggestions;
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
  searchMemories,
  findDuplicates,
  getUpcomingDeadlines,
  getCollectionSuggestions
};