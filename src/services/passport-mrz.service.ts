import fs from 'node:fs'
import vision from '@google-cloud/vision'
import { parse } from 'mrz'
import { env } from '../config/env.js'

type MrzBestEffortResult = {
  score: number
  data: {
    firstName: string
    middleName: string
    lastName: string
    gender: string
    passportNo: string
    nationality: string
    birthDateDDMMYYYY: string
    checks: {
      passportNumberOk: boolean
      birthDateOk: boolean
      expiryOk: boolean
    }
  }
  l1: string
  l2: string
  warnings: string[]
  rawText: string
}

let client: vision.ImageAnnotatorClient | null = null

const credentialsString =
  env.GOOGLE_APPLICATION_CREDENTIALS_JSON ??
  env.GOOGLE_APPLICATION_CREDENTIALS ??
  ''

const getClient = () => {
  if (!credentialsString) {
    throw new Error('Google Vision credentials are missing')
  }

  if (!client) {
    client = new vision.ImageAnnotatorClient({
      credentials: JSON.parse(credentialsString),
    })
  }

  return client
}

const normalizeMrzLine = (line = '') =>
  String(line)
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9<]/g, '')

const extractMrzLinesFromText = (fullText = '') => {
  const lines = String(fullText)
    .split(/\r?\n/)
    .map((line) => normalizeMrzLine(line))
    .filter((line) => /^[A-Z0-9<]{10,}$/.test(line))

  if (lines.length < 2) return null
  return lines.slice(-2)
}

const formatBirthDateDDMMYYYY = (dateValue = '') => {
  if (/^\d{6}$/.test(dateValue)) {
    const yy = Number(dateValue.slice(0, 2))
    const mm = dateValue.slice(2, 4)
    const dd = dateValue.slice(4, 6)
    const yyyy = yy >= 30 ? 1900 + yy : 2000 + yy
    return `${dd}/${mm}/${yyyy}`
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [yyyy, mm, dd] = dateValue.split('-')
    return `${dd}/${mm}/${yyyy}`
  }

  return ''
}

const buildWarnings = (parsed: ReturnType<typeof parse>) => {
  const warnings: string[] = []

  if (!parsed?.valid) warnings.push('mrz_not_fully_valid')
  if (!parsed?.fields?.firstName) warnings.push('mrz_first_name_needs_review')
  if (!parsed?.fields?.lastName) warnings.push('mrz_last_name_needs_review')
  if (!parsed?.fields?.documentNumber) warnings.push('mrz_document_number_needs_review')
  if (!parsed?.fields?.nationality) warnings.push('mrz_nationality_needs_review')
  if (!parsed?.fields?.birthDate) warnings.push('mrz_birth_date_needs_review')

  return warnings
}

const toApiResult = (
  parsed: ReturnType<typeof parse>,
  mrzLines: string[] | null,
  rawText: string,
): MrzBestEffortResult => {
  const fields = parsed.fields || {}

  return {
    score: parsed.valid ? 3 : 1,
    data: {
      firstName: fields.firstName || '',
      middleName: '',
      lastName: fields.lastName || '',
      gender: fields.sex || '',
      passportNo: fields.documentNumber || '',
      nationality: fields.nationality || '',
      birthDateDDMMYYYY: formatBirthDateDDMMYYYY(fields.birthDate || ''),
      checks: {
        passportNumberOk: Boolean(parsed.valid),
        birthDateOk: Boolean(parsed.valid),
        expiryOk: Boolean(parsed.valid),
      },
    },
    l1: mrzLines?.[0] || '',
    l2: mrzLines?.[1] || '',
    warnings: buildWarnings(parsed),
    rawText,
  }
}

export const readMrzBestEffort = async (imagePath: string) => {
  try {
    const imageBytes = fs.readFileSync(imagePath)
    const visionClient = getClient()

    const [result] = await visionClient.textDetection({
      image: { content: imageBytes.toString('base64') },
    })

    const fullText = result?.textAnnotations?.[0]?.description || ''
    if (!fullText) return null

    const mrzLines = extractMrzLinesFromText(fullText)
    if (!mrzLines || mrzLines.length < 2) return null

    const parsed = parse(mrzLines)
    if (!parsed) return null

    return toApiResult(parsed, mrzLines, fullText)
  } catch (error) {
    console.error('Google Vision MRZ error:', error)
    return null
  }
}
