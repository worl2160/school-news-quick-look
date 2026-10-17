// The school list stays empty until the parent types a name or picks a district.
export function filterSchools(schools, { text = "", district = "" }) {
  const q = text.trim();
  if (!q && !district) return [];
  return schools.filter((s) => (!district || s.district === district) && (!q || s.name.includes(q)));
}
