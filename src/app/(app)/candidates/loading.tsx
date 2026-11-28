export default function CandidatesLoading() {
  return (
    <div className="max-w-[1280px] w-full mx-auto space-y-6 animate-pulse">
      <div className="h-14 rounded-2xl bg-white border border-[#E4E7E7]" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-24 rounded-2xl bg-white border border-[#E4E7E7]" />
        <div className="h-24 rounded-2xl bg-white border border-[#E4E7E7]" />
        <div className="h-24 rounded-2xl bg-white border border-[#E4E7E7]" />
        <div className="h-24 rounded-2xl bg-white border border-[#E4E7E7]" />
      </div>
      <div className="h-16 rounded-2xl bg-white border border-[#E4E7E7]" />
      <div className="h-96 rounded-2xl bg-white border border-[#E4E7E7]" />
    </div>
  )
}
