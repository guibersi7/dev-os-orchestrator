"use server";

import { revalidatePath } from "next/cache";
import { disconnectConnection, type Service, syncIntegration } from "@/lib/api-client";

function serviceFromForm(formData: FormData): Service {
  return formData.get("service") as Service;
}

export async function syncConnectionAction(formData: FormData) {
  const service = serviceFromForm(formData);
  await syncIntegration(service);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath(`/integrations/${service}`);
}

export async function disconnectConnectionAction(formData: FormData) {
  const service = serviceFromForm(formData);
  await disconnectConnection(service);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath(`/integrations/${service}`);
}
