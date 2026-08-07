"use server";

import { revalidatePath } from "next/cache";
import { disconnectConnection, saveResourceSelection, type SelectableResource, type Service, syncIntegration } from "@/lib/api-client";

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

export async function saveResourceSelectionAction(formData: FormData) {
  const service = serviceFromForm(formData);
  const selectedValues = formData.getAll("resources").map(String);
  const resources = selectedValues.map((value) => JSON.parse(value) as SelectableResource);
  const settingsValue = formData.get("settings");
  const settings = typeof settingsValue === "string" && settingsValue ? (JSON.parse(settingsValue) as Record<string, unknown>) : undefined;

  await saveResourceSelection(service, resources, settings);
  await syncIntegration(service);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath(`/integrations/${service}`);
  revalidatePath(`/integrations/${service}/resources`);
}
