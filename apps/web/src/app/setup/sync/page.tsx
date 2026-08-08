import { SetupShell } from "@/components/setup/setup-shell";
import { SyncRunner } from "@/components/setup/sync-runner";
import { defaultConnectedIds, sources } from "@/features/wave-one/design-data";

type SetupSyncPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SetupSyncPage({ searchParams }: SetupSyncPageProps) {
  const params = await searchParams;
  const requested = typeof params.sources === "string" ? params.sources.split(",") : [];
  const ids = requested.length > 0 ? requested : defaultConnectedIds;
  const connected = sources.filter((source) => ids.includes(source.id));

  return (
    <SetupShell currentStep={3}>
      <section className="mx-auto w-full max-w-[620px] animate-dos-rise px-5 py-16">
        <SyncRunner sources={connected} />
      </section>
    </SetupShell>
  );
}
