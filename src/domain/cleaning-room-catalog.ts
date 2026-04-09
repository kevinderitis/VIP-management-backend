export type CleaningRoomSeed = {
  code: string
  section: string
  roomType: 'PRIVATE' | 'SHARED'
  bedCount: number
}

const capBeds = (value: number) => Math.min(value, 14)

const privateRooms = [
  '1','2','3','4','5','10','11','12','17','18','19','20','22','23','24','25','26','27','29','30','31','32','32b','33','34','35','36','42','43','51','52','53','54','55','56','57','58','59','60','61','64','65','66','67','68','69','70','100','101','200','201','202',
]

const arenaDorms = [
  ['A',4],['D',4],['6',4],['7',14],['8',8],['9',14],['13',14],['14',14],['15',8],['16',8],['21',8],['28',8],['37',6],['38',8],['39',8],['40',8],['41',8],['41b',16],['41c',10],['44',4],['45',10],['46',16],['47',12],['51b',6],
] as const

const boutiqueDorms = [
  ['F1',4],['F3',6],['F4',6],['F5',4],['F6',12],['F7',4],
] as const

const leClubDorms = [
  ['62',6],['63',6],
] as const

export const defaultCleaningRoomCatalog: CleaningRoomSeed[] = [
  ...privateRooms.map((code) => ({
    code,
    section: 'Arena Hostel',
    roomType: 'PRIVATE' as const,
    bedCount: 1,
  })),
  ...arenaDorms.map(([code, bedCount]) => ({
    code,
    section: 'Arena Hostel',
    roomType: 'SHARED' as const,
    bedCount: capBeds(bedCount),
  })),
  ...boutiqueDorms.map(([code, bedCount]) => ({
    code,
    section: 'Arena Boutique / Seaview',
    roomType: 'SHARED' as const,
    bedCount: capBeds(bedCount),
  })),
  ...leClubDorms.map(([code, bedCount]) => ({
    code,
    section: 'Le Club',
    roomType: 'SHARED' as const,
    bedCount: capBeds(bedCount),
  })),
]
