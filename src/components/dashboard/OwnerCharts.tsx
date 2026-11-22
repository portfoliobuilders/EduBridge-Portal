'use client'

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { formatAED } from '@/lib/money'

interface DailyCollection {
  date: string
  total: number
  count: number
}

interface ModeCollection {
  mode: string
  total: number
  count: number
}

interface StaffLeaderboardItem {
  staff_id: string
  staff_name: string
  admissions: number
  collected: number
  receipts_count: number
  avg_receipt: number
  outstanding: number
}

interface TopEntity {
  university_id?: string
  university_name?: string
  course_id?: string
  course_name?: string
  total: number
  count: number
}

const BRAND_GREEN = '#00A57E'

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    value?: number | string
    payload: { name?: string; count?: number; [key: string]: unknown }
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as { name?: string; count?: number }
    const val = Number(payload[0].value || 0)
    return (
      <div className="bg-white p-3 border border-[#E4E7E7] rounded-xl shadow-md text-xs">
        <p className="font-semibold text-[#0A0A0A]">{label || data.name}</p>
        <p className="text-[#00A57E] font-bold tabular-nums font-mono mt-1">
          {formatAED(val)}
        </p>
        {data.count !== undefined && (
          <p className="text-muted-foreground text-[11px] mt-0.5">
            {data.count} {data.count === 1 ? 'receipt' : 'receipts'}
          </p>
        )}
      </div>
    )
  }
  return null
}

export function DailyCollectionsChart({ data }: { data: DailyCollection[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        No collection data for this period
      </div>
    )
  }

  const formattedData = data.map((d) => ({
    name: d.date.slice(5), // MM-DD
    total: Number(d.total),
    count: d.count,
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E7E7" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7272' }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: '#6B7272' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : String(val))}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total" fill={BRAND_GREEN} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ModeCollectionsChart({ data }: { data: ModeCollection[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        No payment mode data for this period
      </div>
    )
  }

  const modeLabels: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    link: 'Payment Link',
    bank_transfer: 'Bank Transfer',
  }

  const formattedData = data.map((d) => ({
    name: modeLabels[d.mode] || d.mode,
    total: Number(d.total),
    count: d.count,
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E7E7" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7272' }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: '#6B7272' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : String(val))}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total" fill={BRAND_GREEN} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StaffCollectionsChart({ data }: { data: StaffLeaderboardItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        No staff activity recorded for this period
      </div>
    )
  }

  const formattedData = data
    .filter((d) => Number(d.collected) > 0)
    .map((d) => ({
      name: d.staff_name,
      total: Number(d.collected),
      count: d.receipts_count,
    }))

  if (formattedData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        No staff collections in this period
      </div>
    )
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formattedData}
          layout="vertical"
          margin={{ top: 10, right: 20, left: 30, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E4E7E7" />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#6B7272' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : String(val))}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 11, fill: '#0A0A0A' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total" fill={BRAND_GREEN} radius={[0, 4, 4, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TopEntitiesChart({
  data,
  entityNameKey,
}: {
  data: TopEntity[]
  entityNameKey: 'university_name' | 'course_name'
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        No data available for this period
      </div>
    )
  }

  const formattedData = data.slice(0, 5).map((d) => ({
    name: (entityNameKey === 'university_name' ? d.university_name : d.course_name) || 'Unknown',
    total: Number(d.total),
    count: d.count,
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formattedData}
          layout="vertical"
          margin={{ top: 10, right: 20, left: 40, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E4E7E7" />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#6B7272' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : String(val))}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 11, fill: '#0A0A0A' }}
            tickLine={false}
            axisLine={false}
            width={100}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total" fill={BRAND_GREEN} radius={[0, 4, 4, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
