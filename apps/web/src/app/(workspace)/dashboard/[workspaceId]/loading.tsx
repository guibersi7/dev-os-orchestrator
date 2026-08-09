export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1240px] px-5 pb-[72px] pt-[26px]">
      <div className="h-6 w-48 rounded bg-[#161C2B]" />
      <div className="mt-5 h-7 w-full max-w-[680px] animate-pulse rounded bg-[#161C2B]" />
      <div className="mt-2 h-7 w-full max-w-[420px] animate-pulse rounded bg-[#161C2B]" />
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-[13px] border border-[#212938] bg-[#121826]">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="animate-pulse border-b border-[#161C2B] px-[18px] py-5 last:border-b-0">
              <div className="h-3 w-32 rounded bg-[#1A2130]" />
              <div className="mt-3 h-3.5 w-2/3 rounded bg-[#1A2130]" />
              <div className="mt-2 h-3 w-1/2 rounded bg-[#161C2B]" />
            </div>
          ))}
        </div>
        <div className="h-[220px] animate-pulse rounded-[13px] border border-[#212938] bg-[#121826]" />
      </div>
    </div>
  );
}
