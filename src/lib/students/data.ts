import type { SupabaseClient } from "@supabase/supabase-js";
import type { Student } from "./management";

export async function signedStudentPhotos(supabase: SupabaseClient, students: Pick<Student, "photo_path">[]) {
  const paths = [...new Set(students.map((student) => student.photo_path).filter((path): path is string => Boolean(path)))];
  const urls: Record<string, string> = {};
  if (!paths.length) return { urls, failed: false };
  try {
    const { data, error } = await supabase.storage.from("student-photos").createSignedUrls(paths, 3600);
    data?.forEach((item) => { if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl; });
    return { urls, failed: Boolean(error) || paths.some((path) => !urls[path]) };
  } catch {
    return { urls, failed: true };
  }
}
