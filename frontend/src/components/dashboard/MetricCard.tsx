import React from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '../ui/Card'

interface MetricCardProps {
  title: string
  value: string | number
  delta: string
  label: string
  icon: React.ReactNode
  accentClass: string
  isLoading?: boolean
}

export const MetricCard = ({ title, value, delta, label, icon, accentClass, isLoading }: MetricCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
  >
    <Card className="overflow-hidden border border-neutral-200 dark:border-neutral-700 shadow-sm hover:shadow-lg transition-shadow duration-300">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</p>
            <div className="mt-4 flex items-end gap-3">
              {isLoading ? (
                <div className="h-12 w-28 rounded-xl bg-neutral-200 dark:bg-neutral-700" />
              ) : (
                <p className="text-3xl font-semibold text-neutral-900 dark:text-white">{value}</p>
              )}
              <span className="text-sm font-semibold text-accent-600 dark:text-accent-300">{delta}</span>
            </div>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-3xl ${accentClass} text-white shadow-lg`}>
            {icon}
          </div>
        </div>
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">{label}</p>
      </CardContent>
    </Card>
  </motion.div>
)
