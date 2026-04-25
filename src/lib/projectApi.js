import { supabase } from "./supabase";

function getProjectBpm(projectData) {
  return projectData?.daw?.transport?.bpm || projectData?.transport?.bpm || 140;
}

function serializeProjectFile(projectData) {
  return JSON.stringify(projectData, null, 2);
}

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    throw new Error("You must be signed in to use cloud projects.");
  }

  return user.id;
}

export async function saveProjectToCloud(name, projectData) {
  const authenticatedUserId = await getAuthenticatedUserId();
  const id = crypto.randomUUID();
  const storagePath = `${authenticatedUserId}/${id}.os`;
  const blob = new Blob([serializeProjectFile(projectData)], { type: "application/json" });

  const { error: uploadError } = await supabase.storage
    .from("projects")
    .upload(storagePath, blob, { upsert: true });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: dbError } = await supabase.from("projects").insert({
    id,
    user_id: authenticatedUserId,
    name: name.trim(),
    bpm: getProjectBpm(projectData),
    storage_path: storagePath,
    file_size: blob.size,
  });

  if (dbError) {
    throw new Error(dbError.message);
  }

  return id;
}

export async function overwriteProjectInCloud(projectId, name, projectData) {
  const authenticatedUserId = await getAuthenticatedUserId();
  const storagePath = `${authenticatedUserId}/${projectId}.os`;
  const blob = new Blob([serializeProjectFile(projectData)], { type: "application/json" });

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
      bpm: getProjectBpm(projectData),
      file_size: blob.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (dbError) {
    throw new Error(dbError.message);
  }
}

export async function fetchProjects() {
  const authenticatedUserId = await getAuthenticatedUserId();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, bpm, updated_at")
    .eq("user_id", authenticatedUserId)
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
  await getAuthenticatedUserId();
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

export async function findProjectByName(name) {
  const authenticatedUserId = await getAuthenticatedUserId();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, updated_at")
    .eq("user_id", authenticatedUserId)
    .eq("name", name.trim())
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return data || null;
}
