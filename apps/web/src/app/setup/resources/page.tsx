import { SetupShell } from "@/components/setup/setup-shell";
import { ResourcePicker } from "@/components/setup/resource-picker";
import { defaultConnectedIds, sources } from "@/features/wave-one/design-data";

export default function SetupResourcesPage() {
  const connected = sources.filter((source) => defaultConnectedIds.includes(source.id));

  return (
    <SetupShell currentStep={2}>
      <div className="mx-auto w-full max-w-[1000px] animate-dos-rise px-5 py-12">
        <ResourcePicker sources={connected} />
      </div>
    </SetupShell>
  );
}
