import Image from 'next/image'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F5F6F6] text-[#0A0A0A]">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-[#E4E7E7] p-8 text-center flex flex-col items-center">
        <div className="mb-6">
          <Image
            src="/brand/edubridge-logo-color.svg"
            alt="EduBridge Education"
            width={180}
            height={48}
            priority
          />
        </div>
        <h1 className="text-2xl font-semibold mb-2">Receipt & Billing App</h1>
        <p className="text-[#6B7272] text-sm mb-6">
          Admissions Consultancy Receipt & Billing Management System
        </p>
        <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#E6F6F2] text-[#00A57E] text-xs font-medium">
          Part 1 Database & Scaffold Ready
        </div>
      </div>
    </main>
  )
}
