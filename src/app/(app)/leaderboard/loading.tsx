export default function LeaderboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-20 rounded-2xl bg-white border border-[#E4E7E7]" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-36 rounded-2xl bg-white border border-[#E4E7E7]" />
        <div className="h-36 rounded-2xl bg-white border border-[#E4E7E7]" />
        <div className="h-36 rounded-2xl bg-white border border-[#E4E7E7]" />
      </div>
      <div className="h-72 rounded-2xl bg-white border border-[#E4E7E7]" />
    </div>
  )
}
