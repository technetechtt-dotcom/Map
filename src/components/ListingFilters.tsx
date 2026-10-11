import type { FilterField } from "@/lib/listing-filters";

export default function ListingFilters({
  action,
  fields,
  values,
}: {
  action: string;
  fields: FilterField[];
  values: Record<string, string | undefined>;
}) {
  return (
    <form method="get" action={action} className="panel-card mb-5 grid gap-3 md:grid-cols-3">
      {fields.map((field) => (
        <label key={field.name} className="grid gap-1 text-sm font-semibold">
          {field.label}
          {field.type === "select" ? (
            <select className="field" name={field.name} defaultValue={values[field.name] || ""}>
              <option value="">All</option>
              {(field.options || []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input className="field" type={field.type || "text"} name={field.name} defaultValue={values[field.name] || ""} />
          )}
        </label>
      ))}
      {values.archive && <input type="hidden" name="archive" value={values.archive} />}
      <div className="flex items-end gap-2">
        <button className="btn" type="submit">Apply filters</button>
        <a className="secondary-button" href={action}>Reset</a>
      </div>
    </form>
  );
}
