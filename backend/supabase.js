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

async function getAllMemories(userId) {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return data;
}

async function searchMemories(query, userId) {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
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

async function updateMemory(id, updates, userId) {
  const { data, error } = await supabase
    .from("memories")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data[0];
}

async function trashMemory(id, userId) {
  const { data, error } = await supabase
    .from("memories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data[0];
}

async function restoreMemory(id, userId) {
  const { data, error } = await supabase
    .from("memories")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", userId)
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data[0];
}

async function getTrashedMemories(userId) {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function permanentlyDeleteMemory(id, userId) {
  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return { id };
}

const stringSimilarity = require("string-similarity");

async function findDuplicates(userId) {
  const memories = await getAllMemories(userId);

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

async function getUpcomingDeadlines(userId) {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("deadline", "is", null)
    .gte("deadline", new Date().toISOString().split("T")[0])
    .order("deadline", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getCollectionSuggestions(userId) {
  const memories = await getAllMemories(userId);

  const suggestions = [];
  const processedPairs = new Set();

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {

      const memoryA = memories[i];
      const memoryB = memories[j];

      // Skip if already in same collection
      if (memoryA.collection === memoryB.collection) continue;

      const tagsA = memoryA.tags || [];
      const tagsB = memoryB.tags || [];

      const sharedTags = tagsA.filter(tag => tagsB.includes(tag));

      // Require at least TWO shared tags
      if (sharedTags.length < 2) continue;

      const pairKey = [memoryA.id, memoryB.id].sort().join("-");

      if (processedPairs.has(pairKey)) continue;

      processedPairs.add(pairKey);

      suggestions.push({
        tag: sharedTags[0],      // use the first shared tag as the collection name
        count: 2,
        memoryIds: [memoryA.id, memoryB.id]
      });
    }
  }

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