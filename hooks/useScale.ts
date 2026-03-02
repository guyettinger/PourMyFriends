/** Scale hook providing a dp (design points) conversion function */
export function useScale() {
  return {
    dp: (value: number) => value,
  }
}
