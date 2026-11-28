export default function CandidateDetailLoading() {
  return (
    <div className="max-w-[1280px] w-full mx-auto space-y-6 animate-pulse">
      <div className="h-32 rounded-2xl bg-white border border-[#E4E7E7]" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-48 rounded-2xl bg-white border border-[#E4E7E7]" />
          <div className="h-64 rounded-2xl bg-white border border-[#E4E7E7]" />
        </div>
        <div className="space-y-4">
          <div className="h-48 rounded-2xl bg-white border border-[#E4E7E7]" />
          <div className="h-48 rounded-2xl bg-white border border-[#E4E7E7]" />
        </div>
      </div>
    </div>
  )
}
