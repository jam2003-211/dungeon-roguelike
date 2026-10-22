export function canApplyUpdate(atRest: boolean, saving: boolean, busy: boolean, checking: boolean, saveError: boolean): boolean {
  return atRest && !saving && !busy && !checking && !saveError
}
