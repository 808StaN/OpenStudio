import { supabase } from "./supabase";

export async function saveProjectToCloud(userId, name, projectData) {
  const id = crypto.randomUUID();
  const storagePath = `${userId}/${id}.os`;
  const blob = new Blob([JSON.stringify(projectData)], { type: "application/octet-stream" });

  const { error: uploadError } = await supabase.storage
    .from("projects")
    .upload(storagePath, blob, { upsert: true });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: dbError } = await supabase.from("projects").insert({
    id,
    user_id: userId,
    name: name.trim(),
    bpm: projectData.transport?.bpm || 140,
    storage_path: storagePath,
    file_size: blob.size,
  });

  if (dbError) {
    throw new Error(dbError.message);
  }

  return id;
}

export async function overwriteProjectInCloud(projectId, userId, name, projectData) {
  const storagePath = `${userId}/${projectId}.os`;
  const blob = new Blob([JSON.stringify(projectData)], { type: "application/octet-stream" });

  const { error: uploadError } = await supabase.storage
    .from("projects")
    .upload(storagePath, blob, { upsert: true });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: dbError } = await supabase
    .from("projects")
    .update({
      name: name.trim(),
      bpm: projectData.transport?.bpm || 140,
      file_size: blob.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (dbError) {
    throw new Error(dbError.message);
  }
}

export async function fetchProjects(userId) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, bpm, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function loadProjectFromCloud(projectId) {
  const { data: meta, error: metaError } = await supabase
    .from("projects")
    .select("storage_path")
    .eq("id", projectId)
    .single();

  if (metaError || !meta) {
    throw new Error(metaError?.message || "Project not found");
  }

  const { data: file, error: fileError } = await supabase.storage
    .from("projects")
    .download(meta.storage_path);

  if (fileError) {
    throw new Error(fileError.message);
  }

  const text = await file.text();
  return JSON.parse(text);
}

export async function deleteProjectFromCloud(projectId) {
  const { data: meta } = await supabase
    .from("projects")
    .select("storage_path")
    .eq("id", projectId)
    .single();

  if (meta?.storage_path) {
    await supabase.storage.from("projects").remove([meta.storage_path]);
  }

  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function findProjectByName(userId, name) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, updated_at")
    .eq("user_id", userId)
    .eq("name", name.trim())
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return data || null;
}
