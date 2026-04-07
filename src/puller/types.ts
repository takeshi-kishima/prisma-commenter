/** Map of DB table name -> comment. */
export type TableCommentMap = Map<string, string>;

/** Map of "tableName.columnName" (DB names) -> comment. */
export type ColumnCommentMap = Map<string, string>;

/** Comments fetched from the database. */
export interface DbComments {
  tables: TableCommentMap;
  columns: ColumnCommentMap;
}
