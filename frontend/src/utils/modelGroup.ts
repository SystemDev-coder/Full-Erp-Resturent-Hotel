const CATEGORY_LABELS = {
  deep_learning: 'Deep Learning',
  traditional_ml: 'Traditional Model',
  transformers: 'Transformer',
} as const

const CATEGORY_KEYWORDS = {
  deep_learning: ['deep_learning', 'keras', 'lstm', 'cnn', 'gru', 'bilstm'],
  traditional_ml: ['traditional_ml', 'sklearn', 'svc', 'svm', 'linear', 'logistic', 'forest', 'xgboost', 'randomforest'],
  transformers: ['transformers', 'transformer', 'bert', 'roberta', 'afriberta', 'somberta', 'afroxlmr', 'xlm', 'mbert'],
} as const

const normalizeToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

const detectCategoryFromText = (value: string | undefined): keyof typeof CATEGORY_LABELS | null => {
  if (!value) return null

  const normalized = normalizeToken(value)
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[keyof typeof CATEGORY_LABELS, readonly string[]]>) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category
    }
  }

  return null
}

export const getCategoryGroup = (type: string | undefined, metadataPath?: string): string => {
  const folderCategory = detectCategoryFromText(metadataPath)
  if (folderCategory) return CATEGORY_LABELS[folderCategory]

  const typeCategory = detectCategoryFromText(type)
  if (typeCategory) return CATEGORY_LABELS[typeCategory]

  return 'Traditional Model'
}
