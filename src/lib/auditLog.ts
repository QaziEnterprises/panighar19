import { supabase } from "@/integrations/supabase/customClient";

export async function logAction(
  action: "create" | "update" | "delete",
  entityType: string,
  entityId: string,
  description: string
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      user_email: user.email || "unknown",
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
    });
  } catch (e) {
    console.warn("Audit log failed:", e);
  }
}
