/**
 * Default operator presets per filter type.
 */
import type { FilterOperator, FilterType } from '@/lib/filters'

export const DEFAULT_OPERATORS: Record<FilterType, { value: FilterOperator; label: string }[]> = {
    text: [
        { value: 'contains', label: 'Contains' },
        { value: 'equals', label: 'Equals' },
        { value: 'starts_with', label: 'Starts with' },
        { value: 'ends_with', label: 'Ends with' },
        { value: 'not_contains', label: 'Does not contain' },
    ],
    select: [
        { value: 'is', label: 'Is' },
        { value: 'is_not', label: 'Is not' },
    ],
    multi_select: [
        { value: 'in', label: 'Is any of' },
        { value: 'not_in', label: 'Is none of' },
    ],
    tags: [
        { value: 'in', label: 'Includes any' },
    ],
    date_range: [
        { value: 'on', label: 'On' },
        { value: 'before', label: 'Before' },
        { value: 'after', label: 'After' },
        { value: 'between', label: 'Between' },
    ],
    number_range: [
        { value: 'equals', label: 'Equals' },
        { value: 'greater_than', label: 'Greater than' },
        { value: 'less_than', label: 'Less than' },
        { value: 'between', label: 'Between' },
    ],
    toggle: [
        { value: 'equals', label: 'Equals' },
    ],
    autocomplete: [
        { value: 'is', label: 'Is' },
        { value: 'in', label: 'Is any of' },
    ],
}

export const DEFAULT_OPERATOR_BY_TYPE: Record<FilterType, FilterOperator> = {
    text: 'contains',
    select: 'is',
    multi_select: 'in',
    tags: 'in',
    date_range: 'on',
    number_range: 'equals',
    toggle: 'equals',
    autocomplete: 'is',
}
