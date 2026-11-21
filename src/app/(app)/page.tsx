import React from 'react'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { PlusCircle, Users, Receipt, TrendingUp, DollarSign } from 'lucide-react'

export default async function HomePage() {
  const { profile } = await requireUser()

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.full_name}`}
        subtitle={`Signed in as ${profile.role === 'owner' ? 'Owner / Administrator' : 'Admissions Staff'}`}
      >
        <Link href="/receipts/new">
          <Button className="bg-primary hover:bg-[#00805F] text-white rounded-xl shadow-sm gap-2">
            <PlusCircle className="w-4 h-4" />
            + New Receipt
          </Button>
        </Link>
      </PageHeader>

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Today&apos;s Collections</span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display tracking-tight text-foreground tabular-nums">
            AED 0.00
          </p>
          <p className="text-xs text-muted-foreground mt-1">0 receipts recorded today</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">This Month</span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display tracking-tight text-foreground tabular-nums">
            AED 0.00
          </p>
          <p className="text-xs text-muted-foreground mt-1">Monthly collection total</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Candidates</span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display tracking-tight text-foreground tabular-nums">
            0
          </p>
          <p className="text-xs text-muted-foreground mt-1">Enrolled candidates</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Receipts Issued</span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display tracking-tight text-foreground tabular-nums">
            0
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total vouchers in archive</p>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-border shadow-xs">
          <h2 className="text-base font-semibold text-foreground mb-1">Issue Receipt Voucher</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Record a fee installment for a candidate, compute real-time balance, and generate an official receipt PDF.
          </p>
          <Link href="/receipts/new">
            <Button className="bg-primary hover:bg-[#00805F] text-white rounded-xl">
              Start Receipt Entry
            </Button>
          </Link>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-border shadow-xs">
          <h2 className="text-base font-semibold text-foreground mb-1">Manage Candidates & Ledgers</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Lookup enrolled candidates, review running installment ledgers, and download official fee statements.
          </p>
          <Link href="/candidates">
            <Button variant="outline" className="border-border rounded-xl">
              View Candidates List
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
