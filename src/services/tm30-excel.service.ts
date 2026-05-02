import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const defaultTemplate = path.join(
  __dirname,
  '../templates/Template-InformAccom-ImportExcel.xlsx',
)

export const generateTm30Excel = async (input: {
  rows: Array<{
    firstName: string
    middleName?: string
    lastName: string
    gender: string
    passportNo: string
    nationality: string
    birthDate?: string
    checkOut?: string
    phoneNo?: string
  }>
  outFileXlsx: string
  templatePath?: string
}) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(input.templatePath ?? defaultTemplate)

  const worksheet =
    workbook.getWorksheet('แบบแจ้งที่พัก Inform Accom') ?? workbook.worksheets[0]

  if (!worksheet) {
    throw new Error('TM30 template worksheet was not found')
  }

  const lastRow = worksheet.lastRow ? worksheet.lastRow.number : 1
  if (lastRow >= 2) {
    for (let index = lastRow; index >= 2; index -= 1) {
      worksheet.spliceRows(index, 1)
    }
  }

  for (const row of input.rows) {
    worksheet.addRow([
      row.firstName || '',
      row.middleName || '',
      row.lastName || '',
      row.gender || '',
      row.passportNo || '',
      row.nationality || '',
      row.birthDate || '',
      row.checkOut || '',
      row.phoneNo || '',
    ])
  }

  const sourceRow = worksheet.getRow(2)

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)

    for (let column = 1; column <= 9; column += 1) {
      const sourceCell = sourceRow.getCell(column)
      const destinationCell = row.getCell(column)

      if (sourceCell.style) {
        destinationCell.style = JSON.parse(JSON.stringify(sourceCell.style))
      }

      if (sourceCell.numFmt) destinationCell.numFmt = sourceCell.numFmt
      if (sourceCell.alignment) {
        destinationCell.alignment = JSON.parse(JSON.stringify(sourceCell.alignment))
      }
      if (sourceCell.font) destinationCell.font = JSON.parse(JSON.stringify(sourceCell.font))
      if (sourceCell.fill) destinationCell.fill = JSON.parse(JSON.stringify(sourceCell.fill))
      if (sourceCell.border) {
        destinationCell.border = JSON.parse(JSON.stringify(sourceCell.border))
      }
    }

    row.commit()
  }

  fs.mkdirSync(path.dirname(input.outFileXlsx), { recursive: true })
  await workbook.xlsx.writeFile(input.outFileXlsx)
}
