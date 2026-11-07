export type CleaningRoomSeed = {
  code: string
  section: string
  roomType: 'PRIVATE' | 'SHARED'
  bedCount: number
}

const capBeds = (value: number) => Math.min(value, 14)

const arenaPrivateRooms = [
  '1','2','3','4','10','11','12','17','18','19','20','22','23','24','25','26','52','53','54','55','56','100','101',
]

const arenaDorms = [
  ['5',4],['6',4],['7',14],['8',8],['9',14],['13',14],['14',14],['15',8],['16',8],['21',8],
] as const

const leoPrivateRooms = [
  '27','29','30','31','32','32b','33','34','35','36',
]

const leoDorms = [
  ['28',8],['37',6],['38',8],['39',8],['40',8],['41',8],
] as const

const leClubPrivateRooms = [
  '58','59','60','61','64','65','66','67','68','69','70','71',
]

const leClubDorms = [
  ['62',6],['63',6],
] as const

export const defaultCleaningRoomCatalog: CleaningRoomSeed[] = [
  ...arenaPrivateRooms.map((code) => ({
    code,
    section: 'Arena',
    roomType: 'PRIVATE' as const,
    bedCount: 1,
  })),
  ...arenaDorms.map(([code, bedCount]) => ({
    code,
    section: 'Arena',
    roomType: 'SHARED' as const,
    bedCount: capBeds(bedCount),
  })),
  ...leoPrivateRooms.map((code) => ({
    code,
    section: 'Leo',
    roomType: 'PRIVATE' as const,
    bedCount: 1,
  })),
  ...leoDorms.map(([code, bedCount]) => ({
    code,
    section: 'Leo',
    roomType: 'SHARED' as const,
    bedCount: capBeds(bedCount),
  })),
  ...leClubPrivateRooms.map((code) => ({
    code,
    section: 'Le Club',
    roomType: 'PRIVATE' as const,
    bedCount: 1,
  })),
  ...leClubDorms.map(([code, bedCount]) => ({
    code,
    section: 'Le Club',
    roomType: 'SHARED' as const,
    bedCount: capBeds(bedCount),
  })),
]
