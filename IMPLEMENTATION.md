# TSSN Reference Implementation (Pseudocode)

This document provides pseudocode for implementing TSSN parsers and generators. Use this as a reference when creating implementations in your language of choice.

## Parser Implementation

### Core Parser Structure

```python
class TSSNParser:
    """Parse TSSN text into structured schema objects"""
    
    def __init__(self):
        self.current_line = 0
        self.lines = []
        # v0.8.0: Parse-unit default schema set by a non-adjacent
        # top-level @schema comment per Spec Section 2.7.2.
        self.file_schema = None

    def parse(self, tssn_text: str) -> Schema:
        """
        Parse TSSN text and return Schema object (Updated for v0.8.0)

        Args:
            tssn_text: TSSN formatted string

        Returns:
            Schema object with tables, views, type aliases, constraints
        """
        self.lines = tssn_text.split('\n')
        self.current_line = 0

        schema = Schema()
        pending_comments = []  # v0.8.0: buffered leading comments

        while self.current_line < len(self.lines):
            line = self.lines[self.current_line].strip()

            # Skip empty lines
            if not line:
                self.current_line += 1
                continue

            # --- NEW in v0.8.0: Parse type alias declaration ---
            # type OrderStatus = 'pending' | 'shipped' | 'delivered';
            if line.startswith('type '):
                # Pending @schema comments are NOT adjacent to a table
                # or view — they promote to the parse-unit default per
                # Spec 2.7.2.
                self.absorb_pending_schema_to_file(pending_comments)
                alias = self.parse_type_alias(line)
                schema.add_type_alias(alias)
                pending_comments = []
                self.current_line += 1
                continue

            # --- NEW in v0.8.0: Parse view declaration ---
            if line.startswith('view '):
                view = self.parse_interface(kind='view', leading=pending_comments)
                # Fall back to the parse-unit default schema if the
                # view didn't set one locally (Spec 2.7.2).
                if view.schema is None and self.file_schema is not None:
                    view.schema = self.file_schema
                schema.add_view(view)
                pending_comments = []

            # Parse interface (table) declaration
            elif line.startswith('interface'):
                table = self.parse_interface(kind='table', leading=pending_comments)
                if table.schema is None and self.file_schema is not None:
                    table.schema = self.file_schema
                schema.add_table(table)
                pending_comments = []

            # Store standalone comments (schema-level metadata)
            elif line.startswith('//'):
                comment = self.parse_comment(line)
                schema.add_metadata(comment)

            self.current_line += 1

        # --- NEW in v0.8.0: Resolve alias references in columns ---
        self.resolve_aliases(schema)

        return schema

    def parse_type_alias(self, line: str) -> TypeAlias:
        """
        Parse a top-level type alias declaration (New in v0.8.0)

        Format: type Identifier = type_expression;

        Examples:
            type OrderStatus = 'pending' | 'shipped' | 'delivered';
            type Priority = 1 | 2 | 3;
            type ShortCode = string(10);
            type Tags = string[];
        """
        # Strip 'type ' prefix and trailing semicolon
        body = line[len('type '):].rstrip(';').strip()
        match = re.match(r'^(\w+)\s*=\s*(.+)$', body)
        if not match:
            raise ParseError(f"Invalid type alias at line {self.current_line}: {line}")

        name = match.group(1)
        rhs = match.group(2).strip()

        # Reject forward references to other aliases - aliases MUST be concrete
        # The resolver will verify this post-parse.
        return TypeAlias(name=name, raw_rhs=rhs)

    def absorb_pending_schema_to_file(self, pending_comments: list) -> None:
        """
        Promote a non-adjacent top-level @schema annotation to the
        parse-unit default (New in v0.8.0, Spec Section 2.7.2).

        Called when the parser is about to consume a 'type' declaration
        with buffered comments that will otherwise be discarded —
        aliases don't carry leading comments in the AST. If any of
        those comments is `@schema: X`, X becomes the file-level default
        that applies to every subsequent declaration without its own
        @schema. A later non-adjacent @schema replaces it.
        """
        for raw in pending_comments:
            match = re.match(r'^\s*@schema\s*:\s*(\S+)\s*$', raw)
            if match:
                self.file_schema = match.group(1)

    def resolve_aliases(self, schema: Schema) -> None:
        """
        Resolve alias references after the full schema is parsed (v0.8.0).

        For every column whose raw type looks like a known alias name,
        expand it to the alias's underlying type expression.
        """
        alias_map = {a.name: a for a in schema.type_aliases}

        def resolve_column(col: Column) -> None:
            if col.type in alias_map:
                alias = alias_map[col.type]
                # Re-parse the alias RHS using the normal type parser
                col.alias_name = alias.name  # Preserve for round-trip
                self.apply_type_expression(col, alias.raw_rhs)

        for table in schema.tables:
            for col in table.columns:
                resolve_column(col)
        for view in schema.views:
            for col in view.columns:
                resolve_column(col)
    
    def parse_interface(self, kind: str = 'table',
                        leading: list = None) -> Table:
        """
        Parse an interface or view declaration (Updated for v0.8.0)

        Args:
            kind: 'table' for `interface`, 'view' for `view`
            leading: buffered preceding comment lines (v0.8.0)
        """
        leading = leading or []
        line = self.lines[self.current_line]

        # Extract name - supports both simple and quoted identifiers
        # Pattern: (interface|view) `Quoted Name` { OR SimpleName {
        keyword = 'view' if kind == 'view' else 'interface'
        match = re.match(
            rf'{keyword}\s+(?:`([^`]+)`|(\w+))\s*{{',
            line
        )
        if not match:
            raise ParseError(
                f"Invalid {keyword} declaration at line {self.current_line}"
            )

        # Name is either group 1 (quoted) or group 2 (simple)
        table_name = match.group(1) if match.group(1) else match.group(2)
        table = Table(name=table_name, kind=kind)
        
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
        """Extract structured constraints from comment text (Updated for v0.8.0)"""
        constraints = []

        # Primary key
        if re.search(r'\bPRIMARY\s+KEY\b|\bPK\b', comment, re.IGNORECASE):
            constraints.append(Constraint(type='PRIMARY_KEY'))

        # Unique
        if re.search(r'\bUNIQUE\b', comment, re.IGNORECASE):
            constraints.append(Constraint(type='UNIQUE'))

        # Foreign key - now supports cross-schema references (schema.Table(col))
        fk_match = re.search(
            r'FK\s*->\s*(?:(\w+)\.)?(\w+)\((\w+)\)', comment, re.IGNORECASE
        )
        if fk_match:
            constraints.append(Constraint(
                type='FOREIGN_KEY',
                reference_schema=fk_match.group(1),  # None if unqualified
                reference_table=fk_match.group(2),
                reference_column=fk_match.group(3)
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

        # --- NEW in v0.8.0: @computed annotation ---
        # Forms: "@computed" or "@computed: <expression>"
        computed_match = re.search(
            r'@computed(?:\s*:\s*(.+?))?(?:,|$)', comment
        )
        if computed_match:
            constraints.append(Constraint(
                type='COMPUTED',
                value=(computed_match.group(1) or '').strip() or None
            ))

        return constraints

    def parse_interface_level_constraint(self, comment: str) -> Constraint:
        """
        Parse multi-column constraints at interface level (Updated for v0.8.0)

        Recognized forms:
            PK(col1, col2, ...)       -> composite primary key (NEW in v0.8.0)
            UNIQUE(col1, col2, ...)   -> composite unique
            INDEX(col1, col2, ...)    -> composite index
        """
        m = re.match(r'\s*(PK|UNIQUE|INDEX)\s*\(([^)]+)\)', comment, re.IGNORECASE)
        if not m:
            return None

        kind = m.group(1).upper()
        cols = [c.strip() for c in m.group(2).split(',')]
        type_map = {
            'PK': 'COMPOSITE_PRIMARY_KEY',
            'UNIQUE': 'COMPOSITE_UNIQUE',
            'INDEX': 'COMPOSITE_INDEX',
        }
        return Constraint(type=type_map[kind], columns=cols)
    
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

class TSSNGenerator:
    """Generate TSSN format from structured schema"""
    
    def __init__(self, options: dict = None):
        self.options = options or {}
        self.indent = self.options.get('indent', '  ')
        self.type_alignment = self.options.get('type_alignment', 25)
        self.comment_alignment = self.options.get('comment_alignment', 45)
    
    def generate(self, schema: Schema) -> str:
        """
        Generate TSSN text from Schema object
        
        Args:
            schema: Schema object with tables and columns
            
        Returns:
            TSSN formatted string
        """
        output = []
        
        # Add schema-level comments
        if schema.metadata:
            for comment in schema.metadata:
                output.append(f"// {comment}")
            output.append("")
        
        # Generate each table
        for table in schema.tables:
            tssn_table = self.generate_table(table)
            output.append(tssn_table)
            output.append("")  # Blank line between tables
        
        return '\n'.join(output).rstrip() + '\n'
    
    def generate_table(self, table: Table) -> str:
        """Generate TSSN for a single table (Updated for v0.6.0)"""
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
        """Generate TSSN for a single column (Updated for v0.7.0)"""
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
    """Map database-specific types to TSSN semantic types"""
    
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
        Map SQL type to TSSN semantic type (Updated for v0.6.0)

        Args:
            sql_type: Database-specific type name
            length: Optional length/precision

        Returns:
            Tuple of (tssn_type, tssn_length, is_array)
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
        tssn_type = self.type_map.get(sql_type, 'string')

        # Determine if length should be preserved
        preserve_length = sql_type in ['varchar', 'nvarchar', 'char', 'nchar']
        tssn_length = length if preserve_length else None

        return (tssn_type, tssn_length, is_array)


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
            tssn_type, tssn_length, is_array = mapper.map_type(data_type, length)

            column = Column(
                name=col_name,
                type=tssn_type,
                length=tssn_length,
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


## Semantic Validation (New in v0.8.0)

The parser handles syntactic rules. Semantic rules that the grammar
permits but the spec prose forbids are the validator's job. Validators
run after parse() and return a list of ValidationError objects rather
than throwing, so callers can render every problem at once.

```python
class TSSNValidator:
    """Semantic checks (v0.8.0)"""

    # The 14 normative base types from Spec 2.2.1–2.2.4.
    BASE_TYPES = {
        'int', 'decimal', 'float', 'number',
        'string', 'char', 'text',
        'datetime', 'date', 'time',
        'boolean', 'blob', 'uuid', 'json',
    }

    def validate(self, schema: Schema) -> list:
        errors = []
        self.check_duplicate_aliases(schema, errors)
        self.check_alias_shadows_base_type(schema, errors)
        self.check_duplicate_declarations(schema, errors)
        for table in schema.tables:
            self.check_mixed_pk_forms(table, errors)
            self.check_materialized_on_table(table, errors)
        for view in schema.views:
            self.check_view_annotation_combinations(view, errors)
        return errors

    def check_view_annotation_combinations(self, view: Table, errors: list):
        """
        Spec 2.9.3: Reject invalid view annotation combinations.

        - @readonly + @updatable is a direct contradiction
        - @materialized + @updatable is not portable across databases
        """
        if view.readonly_annotated and view.updatable:
            errors.append(ValidationError(
                code='contradictory_view_annotations',
                message=f"View '{view.name}' carries both @readonly and @updatable",
                span=view.span,
            ))
        if view.materialized and view.updatable:
            errors.append(ValidationError(
                code='contradictory_view_annotations',
                message=f"View '{view.name}' is @materialized and @updatable — "
                        f"materialized views cannot be portably updated",
                span=view.span,
            ))

    def check_alias_shadows_base_type(self, schema: Schema, errors: list):
        """Spec 2.2.7: Alias name MUST NOT match a base type."""
        for alias in schema.type_aliases:
            if alias.name in self.BASE_TYPES:
                errors.append(ValidationError(
                    code='alias_shadows_base_type',
                    message=f"Type alias '{alias.name}' collides with a base type",
                    span=alias.span,
                ))

    def check_materialized_on_table(self, table: Table, errors: list):
        """Spec 2.9: @materialized applies only to views."""
        if table.kind == 'table' and table.materialized:
            errors.append(ValidationError(
                code='materialized_on_table',
                message=f"@materialized applies only to views, not '{table.name}'",
                span=table.span,
            ))

    # Additional checks (check_mixed_pk_forms, check_duplicate_*,
    # check_type_expr_base_types, check_union_homogeneity, etc.) follow
    # the same pattern. See reference/typescript/src/validate.ts for
    # the complete reference implementation.
```

## Usage Example

# Parse TSSN
parser = TSSNParser()
schema = parser.parse(tssn_text)
errors = TSSNValidator().validate(schema)
if errors:
    raise ValidationFailed(errors)

# Generate TSSN from database
introspector = DatabaseIntrospector(db_connection)
table = introspector.introspect_table('users')

generator = TSSNGenerator()
tssn_output = generator.generate_table(table)

# Generate TSSN from structured data
schema = Schema()
table = Table(name='Users')
table.add_column(Column(
    name='id',
    type='int',
    nullable=False,
    constraints=[Constraint(type='PRIMARY_KEY')]
))
schema.add_table(table)

tssn_output = generator.generate(schema)
print(tssn_output)
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
        self.views = []            # v0.8.0: first-class views
        self.type_aliases = []     # v0.8.0: type aliases
        self.metadata = []

    def add_table(self, t): self.tables.append(t)
    def add_view(self, v): self.views.append(v)
    def add_type_alias(self, a): self.type_aliases.append(a)
    def add_metadata(self, m): self.metadata.append(m)

class Table:
    def __init__(self, name: str, kind: str = 'table'):
        self.name = name
        self.kind = kind           # v0.8.0: 'table' or 'view'
        self.columns = []
        self.metadata = []
        self.constraint_comments = []
        self.composite_pk = None   # v0.8.0: list of column names or None
        self.schema = None         # v0.8.0: set by @schema or file-level default (Spec 2.7.2)
        # --- View-specific flags (Spec 2.9.2, 2.9.3) ---
        # Only meaningful when kind == 'view'. Spec default is read-only.
        self.materialized = False  # set by @materialized annotation
        self.readonly = True       # unmarked views are read-only per Spec 2.9.2
        self.readonly_annotated = False  # True only when @readonly was written explicitly (for round-trip)
        self.updatable = False     # set by @updatable; overrides default read-only

class TypeAlias:
    """v0.8.0: Reusable type definition (literal union, sized type, array)"""
    def __init__(self, name: str, raw_rhs: str):
        self.name = name           # e.g. 'OrderStatus'
        self.raw_rhs = raw_rhs     # e.g. "'pending' | 'shipped' | 'delivered'"

class Column:
    def __init__(self, name: str, type: str, length: int = None,
                 nullable: bool = True, is_array: bool = False,
                 union_values: list = None,     # v0.7.0
                 alias_name: str = None,        # v0.8.0: originating alias
                 constraints: list = None, comment: str = None):
        self.name = name
        self.type = type
        self.length = length
        self.nullable = nullable
        self.is_array = is_array       # v0.6.0: True for array types like string[]
        self.union_values = union_values  # v0.7.0: ['a','b','c'] or [1,2,3]
        self.alias_name = alias_name   # v0.8.0: Preserves type alias name for round-trip
        self.constraints = constraints or []
        self.comment = comment

    @property
    def is_computed(self) -> bool:
        """v0.8.0: True if column has @computed annotation"""
        return any(c.type == 'COMPUTED' for c in self.constraints)

class Constraint:
    def __init__(self, type: str,
                 reference_schema: str = None,  # v0.8.0: cross-schema FKs
                 reference_table: str = None,
                 reference_column: str = None,
                 value: str = None,
                 columns: list = None):         # v0.8.0: for composite constraints
        self.type = type
        self.reference_schema = reference_schema
        self.reference_table = reference_table
        self.reference_column = reference_column
        self.value = value
        self.columns = columns or []
```

## Notes

This is pseudocode for reference. Real implementations should:

1. Handle edge cases and error conditions
2. Support all databases and type mappings
3. Include comprehensive tests
4. Optimize for performance
5. Follow language-specific best practices
6. Include proper documentation

### v0.8.0 Implementation Notes

This pseudocode has been updated for TSSN v0.8.0 with support for:

- **Type Aliases**: Reusable literal unions and sized types declared at the
  top of the schema
  - Parser: `parse_type_alias()` captures `type Name = ...;` declarations
  - Resolution: `resolve_aliases()` runs post-parse to expand alias references
    into concrete type expressions while preserving the alias name on the Column
  - Schema class: New `type_aliases` collection alongside `tables` and `views`
- **Views**: First-class `view` declarations distinct from `interface`
  - Parser: `parse_interface(kind='view')` handles the `view` keyword
  - Table class: New `kind` field (`'table'` or `'view'`) and
    `materialized`/`readonly` flags driven by `@materialized`/`@readonly`
    annotations
- **Composite Primary Keys**: Interface-level `PK(col1, col2, ...)` comments
  - Parser: `parse_interface_level_constraint()` recognises
    `PK(...)` / `UNIQUE(...)` / `INDEX(...)` uniformly
  - Table class: New `composite_pk` field (list of column names or `None`)
- **`@computed` Annotation**: Marks derived columns in `parse_constraints()`
  - Produces a `Constraint(type='COMPUTED', value=expression_or_None)`
  - Column exposes `is_computed` property for consumers
- **Cross-Schema FK Triples**: Foreign-key regex now captures an optional
  schema prefix, producing `(schema, table, column)` triples on the
  `FOREIGN_KEY` constraint
- **File-Level `@schema` Propagation** (Spec 2.7.2): Non-adjacent top-
  level `@schema` annotations promote to a parse-unit default that
  applies to every subsequent declaration lacking its own `@schema`
  - Parser: `absorb_pending_schema_to_file()` is invoked before every
    `type` declaration and scans buffered leading comments for a
    `@schema: X` pattern, storing X in `self.file_schema`
  - `parse_interface()` for both tables and views falls back to
    `self.file_schema` when no local `@schema` attaches
  - A later non-adjacent `@schema` replaces the default; adjacent
    annotations do not
- **View Annotation Interaction** (Spec 2.9.3): The default writability
  of a `view` declaration is read-only. Invalid combinations are
  rejected by the validator, not the parser
  - `Table.readonly` defaults to `True` (previously `None`, tri-state)
  - `Table.readonly_annotated` records whether `@readonly` was written
    explicitly, for round-trip regeneration
  - `Table.updatable` flips read-only when `@updatable` is present
  - `TSSNValidator.check_view_annotation_combinations()` rejects
    `@readonly + @updatable` and `@materialized + @updatable` with
    the `contradictory_view_annotations` error code
- **Validator**: New `TSSNValidator` class with `BASE_TYPES` constant
  (the 14 normative base types) and checks for alias name collisions,
  unknown base types, mixed-literal unions, mixed PK forms, duplicate
  columns/aliases/declarations, and composite constraint column
  references. See the Semantic Validation section earlier in this
  document.

### v0.7.0 Implementation Notes

This pseudocode has been updated for TSSN v0.7.0 with support for:

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
