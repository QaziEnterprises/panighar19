import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { action, email, password, displayName, userId, role } = await req.json();

    if (action === "create") {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName || email.split("@")[0] },
      });
      if (error) return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Create profile and role for the new user
      const newUserId = data.user.id;
      await supabaseAdmin.from("profiles").insert({
        user_id: newUserId,
        email,
        display_name: displayName || email.split("@")[0],
      });
      await supabaseAdmin.from("user_roles").insert({
        user_id: newUserId,
        role: "user",
      });

      return new Response(JSON.stringify({ user: data.user }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update") {
      const updates: any = {};
      if (password) updates.password = password;
      if (displayName !== undefined) {
        updates.user_metadata = { display_name: displayName };
        await supabaseAdmin.from("profiles").update({ display_name: displayName }).eq("user_id", userId);
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, updates);
      if (error) return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Update role if provided
      if (role) {
        // Upsert: update existing role or insert new one
        const { data: existingRole } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).maybeSingle();
        if (existingRole) {
          await supabaseAdmin.from("user_roles").update({ role }).eq("user_id", userId);
        } else {
          await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
