import { SetupShell } from "@/components/setup/setup-shell";
import { ConnectionCenter } from "@/components/setup/connection-center";
import { defaultConnectedIds, sources } from "@/features/wave-one/design-data";

export default function SetupConnectPage() {
  return (
    <SetupShell currentStep={1}>
      <section className="mx-auto w-full max-w-[780px] px-5 py-14">
        <div className="animate-dos-rise">
          <h1 className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">
            Connect your sources
          </h1>
          <p className="mt-3 text-[15px] leading-normal text-[#9AA4BA]">
            Pick everything you want in from day one. One tool already answers what should I do now. Three make the
            answer hard to argue with.
          </p>

          <ConnectionCenter initialSelection={defaultConnectedIds} recommendedId="github" sources={sources} />
        </div>
      </section>
    </SetupShell>
  );
}
