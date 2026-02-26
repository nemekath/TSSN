# LINDT Reference Implementation (Pseudocode)

This document provides pseudocode for implementing LINDT parsers and generators. Use this as a reference when creating implementations in your language of choice.

## Parser Implementation

### Core Parser Structure

```python
class LINDTParser:
    """Parse LINDT text into structured schema objects"""
    
    def __init__(self):
        self.current_line = 0
        self.lines = []
    
    def parse(self, lindt_text: str) -> Schema:
        """
        Parse LINDT text and return Schema object
        
        Args:
            lindt_text: LINDT formatted string
            
        Returns:
            Schema object with tables, columns, constraints
        """
        self.lines = lindt_text.split('\n')
        self.current_line = 0
        
        schema = Schema()
        
        while self.current_line < len(self.lines):
            line = self.lines[self.current_line].strip()
            
            # Skip empty lines
            if not line:
                self.current_line += 1
                continue
            
            # Parse interface (table) declaration
            if line.startswith('interface'):
                table = self.parse_interface()
                schema.add_table(table)
            
            # Store standalone comments (schema-level metadata)
            elif line.startswith('//'):
                comment = self.parse_comment(line)
                schema.add_metadata(comment)
            
            self.current_line += 1
        
        return schema
    
    def parse_interface(self) -> Table:
        """Parse an interface declaration into a Table object (v0.6.0)"""
        line = self.lines[self.current_line]

        # Extract table name - supports both simple and quoted identifiers
        # Pattern: interface `Quoted Name` { OR interface SimpleName {
        match = re.match(r'interface\s+(?:`([^`]+)`|(\w+))\s*{', line)
        if not match:
            raise ParseError(f"Invalid interface declaration at line {self.current_line}")

        # Name is either group 1 (quoted) or group 2 (simple)
        table_name = match.group(1) if match.group(1) else match.group(2)
        table = Table(name=table_name)
        
        # Parse preceding comments (table-level metadata)
        table.metadata = self.parse_preceding_comments()
        
        # Move to first column
        self.current_line += 1
        
        # Parse columns until we hit closing brace
        while self.current_line < len(self.lines):
            line = self.lines[self.current_line].strip()
            
            # End of interface
            if line == '}':
                break
            
            # Skip empty lines
            if not line:
                self.current_line += 1
                continue
            
            # Parse standalone comments (table-level constraints)
            if line.startswith('//'):
                comment = self.parse_comment(line)
                table.add_constraint_comment(comment)
                self.current_line += 1
                continue
            
            # Parse column definition
            if ':' in line:
                column = self.parse_column(line)
                table.add_column(column)
            
            self.current_line += 1
        
        return table
    
    def parse_column(self, line: str) -> Column:
        """
        Parse column definition (Updated for v0.7.0)

        Format: identifier?: type(length)[] | 'lit1' | 'lit2'; // comment
        Supports: quoted identifiers, array types, literal unions
        """
        # Remove trailing semicolon
        line = line.rstrip(';').strip()

        # Split into definition and comment
        parts = line.split('//', 1)
        definition = parts[0].strip()
        comment = parts[1].strip() if len(parts) > 1 else None

        # --- Regex for quoted identifiers ---
        # Group 1: Quoted name (without backticks)
        # Group 2: Simple name
        # Group 3: Nullable marker (?)
        # Group 4: Type definition
        col_pattern = r'^(?:`([^`]+)`|(\w+))(\??)\s*:\s*(.+)$'
        match = re.match(col_pattern, definition)

        if not match:
            raise ParseError(f"Invalid column definition: {definition}")

        # Name is either group 1 (quoted) or group 2 (simple)
        column_name = match.group(1) if match.group(1) else match.group(2)
        nullable = bool(match.group(3))
        type_part = match.group(4).strip()

        # --- NEW in v0.7.0: Check for literal union types ---
        # Union types contain | and literals ('string' or numbers)
        union_pattern = r"^('[^']*'|\d+)(\s*\|\s*('[^']*'|\d+))+$"
        if re.match(union_pattern, type_part):
            # Parse union type
            union_values = self.parse_union_type(type_part)
            return Column(
                name=column_name,
                type='union',  # Special type marker
                nullable=nullable,
                union_values=union_values,  # New in v0.7.0
                constraints=[],
                comment=comment
            )

        # --- Standard type parsing (v0.6.0) ---
        # Group 1: Base type
        # Group 2: Length (optional)
        # Group 3: Array suffix (optional)
        type_pattern = r'^(\w+)(?:\((\d+)\))?(\[\])?$'
        type_match = re.match(type_pattern, type_part)

        if not type_match:
            raise ParseError(f"Invalid type definition: {type_part}")

        data_type = type_match.group(1)
        length = int(type_match.group(2)) if type_match.group(2) else None
        is_array = bool(type_match.group(3))

        # Parse constraints from comment
        constraints = self.parse_constraints(comment) if comment else []

        return Column(
            name=column_name,
            type=data_type,
            length=length,
            nullable=nullable,
            is_array=is_array,
            constraints=constraints,
            comment=comment
        )

    def parse_union_type(self, type_part: str) -> list:
        """
        Parse literal union type (New in v0.7.0)

        Input: "'pending' | 'shipped' | 'delivered'" or "1 | 2 | 3"
        Output: ['pending', 'shipped', 'delivered'] or [1, 2, 3]
        """
        values = []
        for part in type_part.split('|'):
            part = part.strip()
            if part.startswith("'") and part.endswith("'"):
                # String literal
                values.append(part[1:-1])
            else:
                # Numeric literal
                values.append(int(part))
        return values
    
    def parse_constraints(self, comment: str) -> list:
        """Extract structured constraints from comment text"""
        constraints = []
        
        # Primary key
        if re.search(r'\bPRIMARY\s+KEY\b|\bPK\b', comment, re.IGNORECASE):
            constraints.append(Constraint(type='PRIMARY_KEY'))
        
        # Unique
        if re.search(r'\bUNIQUE\b', comment, re.IGNORECASE):
            constraints.append(Constraint(type='UNIQUE'))
        
        # Foreign key
        fk_match = re.search(r'FK\s*->\s*(\w+)\((\w+)\)', comment, re.IGNORECASE)
        if fk_match:
            constraints.append(Constraint(
                type='FOREIGN_KEY',
                reference_table=fk_match.group(1),
                reference_column=fk_match.group(2)
            ))
        
        # Index
        if re.search(r'\bINDEX\b', comment, re.IGNORECASE):
            constraints.append(Constraint(type='INDEX'))
        
        # Auto increment
        if re.search(r'\bAUTO_INCREMENT\b|\bIDENTITY\b', comment, re.IGNORECASE):
            constraints.append(Constraint(type='AUTO_INCREMENT'))
        
        # Default value
        default_match = re.search(r'DEFAULT\s+(.+?)(?:,|$)', comment, re.IGNORECASE)
        if default_match:
            constraints.append(Constraint(
                type='DEFAULT',
                value=default_match.group(1).strip()
            ))
        
        return constraints
    
    def parse_preceding_comments(self) -> list:
        """Parse comments that appear before current position"""
        comments = []
        line_num = self.current_line - 1
        
        while line_num >= 0:
            line = self.lines[line_num].strip()
            if not line or line.startswith('//'):
                if line.startswith('//'):
                    comments.insert(0, line[2:].strip())
                line_num -= 1
            else:
                break
        
        return comments
    
    def parse_comment(self, line: str) -> str:
        """Extract comment text"""
        return line[2:].strip() if line.startswith('//') else line


## Generator Implementation

class LINDTGenerator:
    """Generate LINDT format from structured schema"""
    
    def __init__(self, options: dict = None):
        self.options = options or {}
        self.indent = self.options.get('indent', '  ')
        self.type_alignment = self.options.get('type_alignment', 25)
        self.comment_alignment = self.options.get('comment_alignment', 45)
    
    def generate(self, schema: Schema) -> str:
        """
        Generate LINDT text from Schema object
        
        Args:
            schema: Schema object with tables and columns
            
        Returns:
            LINDT formatted string
        """
        output = []
        
        # Add schema-level comments
        if schema.metadata:
            for comment in schema.metadata:
                output.append(f"// {comment}")
            output.append("")
        
        # Generate each table
        for table in schema.tables:
            lindt_table = self.generate_table(table)
            output.append(lindt_table)
            output.append("")  # Blank line between tables
        
        return '\n'.join(output).rstrip() + '\n'
    
    def generate_table(self, table: Table) -> str:
        """Generate LINDT for a single table (Updated for v0.6.0)"""
        lines = []

        # Add table-level comments
        if table.metadata:
            for comment in table.metadata:
                lines.append(f"// {comment}")

        # Add table-level constraints (UNIQUE, INDEX on multiple columns)
        if table.constraint_comments:
            for comment in table.constraint_comments:
                lines.append(f"// {comment}")

        # Interface declaration - quote name if contains special characters
        table_name = table.name
        if not re.match(r'^\w+$', table_name):
            table_name = f"`{table_name}`"  # Quote non-standard identifiers
        lines.append(f"interface {table_name} {{")
        
        # Sort columns: PK first, then regular columns, timestamps last
        sorted_columns = self.sort_columns(table.columns)
        
        # Generate column definitions
        for column in sorted_columns:
            column_line = self.generate_column(column)
            lines.append(f"{self.indent}{column_line}")
        
        # Close interface
        lines.append("}")
        
        return '\n'.join(lines)
    
    def generate_column(self, column: Column) -> str:
        """Generate LINDT for a single column (Updated for v0.7.0)"""
        # Build column name - quote if contains special characters
        name = column.name
        if not re.match(r'^\w+$', name):
            name = f"`{name}`"  # Quote non-standard identifiers
        if column.nullable:
            name += '?'

        # --- NEW in v0.7.0: Handle union types ---
        if column.type == 'union' and column.union_values:
            type_str = self.generate_union_type(column.union_values)
        else:
            # Build type with optional length and array suffix
            type_str = column.type
            if column.length:
                type_str += f"({column.length})"
            if getattr(column, 'is_array', False):
                type_str += "[]"

        # Build definition part
        definition = f"{name}: {type_str};"
        
        # Pad definition to type alignment
        definition = definition.ljust(self.type_alignment)
        
        # Build comment from constraints
        comment = self.generate_constraint_comment(column)
        
        if comment:
            # Align comment
            total_width = len(definition)
            if total_width < self.comment_alignment:
                padding = ' ' * (self.comment_alignment - total_width)
                definition += padding
            definition += f" // {comment}"
        
        return definition

    def generate_union_type(self, values: list) -> str:
        """
        Generate literal union type string (New in v0.7.0)

        Input: ['pending', 'shipped'] or [1, 2, 3]
        Output: "'pending' | 'shipped'" or "1 | 2 | 3"
        """
        parts = []
        for val in values:
            if isinstance(val, str):
                parts.append(f"'{val}'")
            else:
                parts.append(str(val))
        return ' | '.join(parts)

    def generate_constraint_comment(self, column: Column) -> str:
        """Generate comment text from column constraints"""
        parts = []
        
        for constraint in column.constraints:
            if constraint.type == 'PRIMARY_KEY':
                parts.append('PRIMARY KEY')
            elif constraint.type == 'UNIQUE':
                parts.append('UNIQUE')
            elif constraint.type == 'FOREIGN_KEY':
                parts.append(f"FK -> {constraint.reference_table}({constraint.reference_column})")
            elif constraint.type == 'INDEX':
                parts.append('INDEX')
            elif constraint.type == 'AUTO_INCREMENT':
                parts.append('AUTO_INCREMENT')
            elif constraint.type == 'DEFAULT':
                parts.append(f"DEFAULT {constraint.value}")
        
        # Include custom comment if present
        if column.comment and not any(c.type in column.comment.upper() for c in column.constraints):
            parts.append(column.comment)
        
        return ', '.join(parts)
    
    def sort_columns(self, columns: list) -> list:
        """Sort columns logically"""
        def sort_key(col):
            # Primary keys first
            if any(c.type == 'PRIMARY_KEY' for c in col.constraints):
                return (0, col.name)
            # Timestamp columns last
            elif col.name.lower() in ['created_at', 'updated_at', 'deleted_at']:
                return (2, col.name)
            # Everything else in between
            else:
                return (1, col.name)
        
        return sorted(columns, key=sort_key)


## Type Mapper

class TypeMapper:
    """Map database-specific types to LINDT semantic types"""
    
    # Type mapping tables
    POSTGRES_TYPES = {
        'integer': 'int',
        'bigint': 'int',
        'smallint': 'int',
        'serial': 'int',
        'bigserial': 'int',
        'varchar': 'string',
        'text': 'text',
        'char': 'string',
        'timestamp': 'datetime',
        'timestamptz': 'datetime',
        'date': 'date',
        'time': 'time',
        'boolean': 'boolean',
        'numeric': 'decimal',
        'decimal': 'decimal',
        'real': 'float',
        'double precision': 'float',
        'bytea': 'blob',
        'uuid': 'uuid',
        'json': 'json',
        'jsonb': 'json',
    }
    
    MYSQL_TYPES = {
        'int': 'int',
        'bigint': 'int',
        'smallint': 'int',
        'tinyint': 'int',  # Note: tinyint(1) -> boolean
        'varchar': 'string',
        'text': 'text',
        'char': 'string',
        'datetime': 'datetime',
        'timestamp': 'datetime',
        'date': 'date',
        'time': 'time',
        'decimal': 'decimal',
        'float': 'float',
        'double': 'float',
        'blob': 'blob',
    }
    
    SQLSERVER_TYPES = {
        'int': 'int',
        'bigint': 'int',
        'smallint': 'int',
        'tinyint': 'int',
        'varchar': 'string',
        'nvarchar': 'string',
        'text': 'text',
        'ntext': 'text',
        'char': 'string',
        'nchar': 'string',
        'datetime': 'datetime',
        'datetime2': 'datetime',
        'date': 'date',
        'time': 'time',
        'bit': 'boolean',
        'decimal': 'decimal',
        'numeric': 'decimal',
        'money': 'decimal',
        'float': 'float',
        'real': 'float',
        'varbinary': 'blob',
        'image': 'blob',
        'uniqueidentifier': 'uuid',
    }
    
    def __init__(self, database_type: str):
        self.database_type = database_type.lower()
        
        # Select appropriate mapping table
        if self.database_type == 'postgresql':
            self.type_map = self.POSTGRES_TYPES
        elif self.database_type == 'mysql':
            self.type_map = self.MYSQL_TYPES
        elif self.database_type in ['sqlserver', 'mssql']:
            self.type_map = self.SQLSERVER_TYPES
        else:
            raise ValueError(f"Unsupported database type: {database_type}")
    
    def map_type(self, sql_type: str, length: int = None) -> tuple:
        """
        Map SQL type to LINDT semantic type (Updated for v0.6.0)

        Args:
            sql_type: Database-specific type name
            length: Optional length/precision

        Returns:
            Tuple of (lindt_type, lindt_length, is_array)
        """
        # Normalize type name
        sql_type = sql_type.lower()

        # --- NEW in v0.6.0: Detect PostgreSQL array types ---
        is_array = False
        if sql_type.endswith('[]'):
            is_array = True
            sql_type = sql_type[:-2]  # Remove [] suffix
        elif sql_type.startswith('_'):
            # PostgreSQL internal array notation (e.g., _int4, _text)
            is_array = True
            sql_type = sql_type[1:]  # Remove _ prefix

        # Special case: MySQL tinyint(1) is boolean
        if self.database_type == 'mysql' and sql_type == 'tinyint' and length == 1:
            return ('boolean', None, is_array)

        # Look up in mapping table
        lindt_type = self.type_map.get(sql_type, 'string')

        # Determine if length should be preserved
        preserve_length = sql_type in ['varchar', 'nvarchar', 'char', 'nchar']
        lindt_length = length if preserve_length else None

        return (lindt_type, lindt_length, is_array)


## Database Introspection (Example for PostgreSQL)

class DatabaseIntrospector:
    """Extract schema information from database"""
    
    def __init__(self, connection):
        self.conn = connection
        self.cursor = connection.cursor()
    
    # Default schemas per database (used for @schema auto-detection)
    DEFAULT_SCHEMAS = {
        'postgresql': 'public',
        'mysql': None,  # MySQL uses database name, no separate schema
        'sqlserver': 'dbo',
        'mssql': 'dbo',
    }

    def introspect_table(self, table_name: str, schema: str = 'public',
                         database_type: str = 'postgresql') -> Table:
        """Extract complete table schema including constraints (Updated for v0.6.0)"""

        table = Table(name=table_name)

        # --- NEW in v0.6.0: Auto-detect non-default schema ---
        default_schema = self.DEFAULT_SCHEMAS.get(database_type.lower(), 'public')
        if schema and schema != default_schema:
            table.metadata.append(f"@schema: {schema}")

        # Get columns
        columns = self.get_columns(table_name, schema)
        for col in columns:
            table.add_column(col)

        # Get constraints
        constraints = self.get_constraints(table_name, schema)
        self.apply_constraints(table, constraints)

        return table
    
    def get_columns(self, table_name: str, schema: str) -> list:
        """Query column information"""
        query = """
            SELECT 
                column_name,
                data_type,
                character_maximum_length,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
            ORDER BY ordinal_position
        """
        
        self.cursor.execute(query, (schema, table_name))
        
        columns = []
        mapper = TypeMapper('postgresql')
        
        for row in self.cursor.fetchall():
            col_name, data_type, length, is_nullable, default = row

            # Map type (Updated for v0.6.0 - now returns 3 values)
            lindt_type, lindt_length, is_array = mapper.map_type(data_type, length)

            column = Column(
                name=col_name,
                type=lindt_type,
                length=lindt_length,
                nullable=(is_nullable == 'YES'),
                is_array=is_array,  # New in v0.6.0
                constraints=[]
            )
            
            # Add default constraint if present
            if default:
                column.constraints.append(Constraint(
                    type='DEFAULT',
                    value=default
                ))
            
            columns.append(column)
        
        return columns
    
    def get_constraints(self, table_name: str, schema: str) -> dict:
        """Query constraint information"""
        query = """
            SELECT 
                tc.constraint_type,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            LEFT JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
              AND tc.table_schema = ccu.table_schema
            WHERE tc.table_schema = %s
              AND tc.table_name = %s
        """
        
        self.cursor.execute(query, (schema, table_name))
        return self.cursor.fetchall()
    
    def apply_constraints(self, table: Table, constraint_rows: list):
        """Apply constraint information to table columns"""
        for row in constraint_rows:
            constraint_type, column_name, ref_table, ref_column = row
            
            # Find column
            column = table.get_column(column_name)
            if not column:
                continue
            
            # Add constraint
            if constraint_type == 'PRIMARY KEY':
                column.constraints.append(Constraint(type='PRIMARY_KEY'))
            elif constraint_type == 'UNIQUE':
                column.constraints.append(Constraint(type='UNIQUE'))
            elif constraint_type == 'FOREIGN KEY':
                column.constraints.append(Constraint(
                    type='FOREIGN_KEY',
                    reference_table=ref_table,
                    reference_column=ref_column
                ))


## Usage Example

# Parse LINDT
parser = LINDTParser()
schema = parser.parse(lindt_text)

# Generate LINDT from database
introspector = DatabaseIntrospector(db_connection)
table = introspector.introspect_table('users')

generator = LINDTGenerator()
lindt_output = generator.generate_table(table)

# Generate LINDT from structured data
schema = Schema()
table = Table(name='Users')
table.add_column(Column(
    name='id',
    type='int',
    nullable=False,
    constraints=[Constraint(type='PRIMARY_KEY')]
))
schema.add_table(table)

lindt_output = generator.generate(schema)
print(lindt_output)
# Output:
# interface Users {
#   id: int;              // PRIMARY KEY
# }
```

## Data Structures

```python
class Schema:
    def __init__(self):
        self.tables = []
        self.metadata = []

class Table:
    def __init__(self, name: str):
        self.name = name
        self.columns = []
        self.metadata = []
        self.constraint_comments = []

class Column:
    def __init__(self, name: str, type: str, length: int = None,
                 nullable: bool = True, is_array: bool = False,
                 union_values: list = None,  # New in v0.7.0
                 constraints: list = None, comment: str = None):
        self.name = name
        self.type = type
        self.length = length
        self.nullable = nullable
        self.is_array = is_array      # v0.6.0: True for array types like string[]
        self.union_values = union_values  # v0.7.0: ['a','b','c'] or [1,2,3]
        self.constraints = constraints or []
        self.comment = comment

class Constraint:
    def __init__(self, type: str, reference_table: str = None, 
                 reference_column: str = None, value: str = None):
        self.type = type
        self.reference_table = reference_table
        self.reference_column = reference_column
        self.value = value
```

## Notes

This is pseudocode for reference. Real implementations should:

1. Handle edge cases and error conditions
2. Support all databases and type mappings
3. Include comprehensive tests
4. Optimize for performance
5. Follow language-specific best practices
6. Include proper documentation

### v0.7.0 Implementation Notes

This pseudocode has been updated for LINDT v0.7.0 with support for:

- **Literal Union Types**: TypeScript-style unions for enum columns
  - Parser: `parse_union_type()` extracts values from `'a' | 'b' | 'c'` or `1 | 2 | 3`
  - Generator: `generate_union_type()` formats union values with proper quoting
  - Column class: New `union_values` field stores parsed literals
  - Detection: Regex `^('[^']*'|\d+)(\s*\|\s*('[^']*'|\d+))+$` identifies unions

### v0.6.0 Implementation Notes

- **Quoted Identifiers**: Backtick syntax for identifiers with spaces/special characters
  - Parser: Uses regex alternation `(?:\`([^\`]+)\`|(\w+))` to match both forms
  - Generator: Auto-quotes names that don't match `^\w+$`
- **Array Types**: The `[]` suffix for PostgreSQL array columns
  - Parser: Extended type regex to capture optional `(\[\])?` suffix
  - Generator: Appends `[]` when `is_array=True`
  - TypeMapper: Detects PostgreSQL array notation (`text[]` or `_text`)
- **Schema Auto-Detection**: Automatic `@schema` annotation for non-default schemas
  - Introspector: Compares against `DEFAULT_SCHEMAS` per database type
  - Emits `@schema: X` metadata when schema differs from default (public/dbo)
