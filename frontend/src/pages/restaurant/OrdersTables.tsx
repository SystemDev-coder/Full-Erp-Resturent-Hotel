import { useState } from 'react'
import { ClipboardList, LayoutGrid } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import Orders from './Orders'
import Tables from './Tables'

// Orders & Tables live under ONE sidebar entry, split by tabs.
export default function OrdersTables() {
  const [tab, setTab] = useState<'orders' | 'tables'>('orders')

  return (
    <div className="space-y-5">
      <Tabs
        active={tab}
        onChange={k => setTab(k as 'orders' | 'tables')}
        tabs={[
          { key: 'orders', label: 'Orders', icon: <ClipboardList size={14} /> },
          { key: 'tables', label: 'Tables', icon: <LayoutGrid size={14} /> },
        ]}
      />
      {tab === 'orders' ? <Orders /> : <Tables />}
    </div>
  )
}
