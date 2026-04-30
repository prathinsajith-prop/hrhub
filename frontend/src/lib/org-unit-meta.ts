import type { FC } from 'react'
import { MapPin, Layers, Users2 } from 'lucide-react'

export type OrgUnitType = 'branch' | 'division' | 'department'

export interface OrgUnitMeta {
    label:     string
    plural:    string
    icon:      FC<{ className?: string }>
    /** pill badge used in the settings tree */
    badge:     string
    /** stat card colours used in both the settings tab and chart page */
    stat:      string
    /** full card accent used in the org chart page */
    card:      string
    /** left-border / connector colour */
    connector: string
    /** icon fill colour string for lucide icons */
    iconColor: string
    /** depth indent for the settings tree (tailwind margin-left) */
    treeIndent: string
}

export const ORG_TYPE_META: Record<OrgUnitType, OrgUnitMeta> = {
    branch: {
        label:      'Branch',
        plural:     'Branches',
        icon:       MapPin,
        badge:      'text-emerald-700 bg-emerald-50 border-emerald-200',
        stat:       'border-emerald-200 bg-emerald-50 text-emerald-700',
        card:       'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/10',
        connector:  'border-emerald-200',
        iconColor:  'text-emerald-700',
        treeIndent: '',
    },
    division: {
        label:      'Division',
        plural:     'Divisions',
        icon:       Layers,
        badge:      'text-violet-700 bg-violet-50 border-violet-200',
        stat:       'border-violet-200 bg-violet-50 text-violet-700',
        card:       'border-violet-200/80 bg-violet-50/40 dark:bg-violet-950/10',
        connector:  'border-violet-100',
        iconColor:  'text-violet-700',
        treeIndent: 'ml-6',
    },
    department: {
        label:      'Department',
        plural:     'Departments',
        icon:       Users2,
        badge:      'text-blue-700 bg-blue-50 border-blue-200',
        stat:       'border-blue-200 bg-blue-50 text-blue-700',
        card:       'border-blue-100 bg-background',
        connector:  'border-blue-100',
        iconColor:  'text-blue-600',
        treeIndent: 'ml-12',
    },
}

export const ORG_HIERARCHY: OrgUnitType[] = ['branch', 'division', 'department']

export const PARENT_TYPE: Partial<Record<OrgUnitType, OrgUnitType>> = {
    division:   'branch',
    department: 'division',
}

