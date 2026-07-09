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

  if (error) {
    throw new Error(error.message);
  }

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
    .eq("user_Id", userId);

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

  const tagToUngroupedMemories = {};

  memories.forEach(memory => {
    (memory.tags || []).forEach(tag => {
      if (memory.collection !== tag) {
        if (!tagToUngroupedMemories[tag]) tagToUngroupedMemories[tag] = [];
        tagToUngroupedMemories[tag].push(memory);
      }
    });
  });

  const suggestions = [];
  for (const tag in tagToUngroupedMemories) {
    const matchingMemories = tagToUngroupedMemories[tag];
    if (matchingMemories.length >= 2) {
      suggestions.push({
        tag: tag,
        count: matchingMemories.length,
        memoryIds: matchingMemories.map(m => m.id)
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