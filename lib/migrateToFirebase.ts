// Legacy whole-list migration is disabled to protect existing server data.
export async function migrateToFirebase(): Promise<{
  success: boolean;
  migrated: string[];
  errors: string[];
}> {
  return { success: false, migrated: [], errors: ['안전을 위해 기존 전체 목록 마이그레이션은 비활성화되었습니다. 운영 데이터는 변경하지 않았습니다.'] };
}
