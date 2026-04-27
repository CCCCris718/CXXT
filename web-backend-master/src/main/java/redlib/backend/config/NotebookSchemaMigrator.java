package redlib.backend.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;

@Component
public class NotebookSchemaMigrator implements ApplicationRunner {
    private final DataSource dataSource;
    private final JdbcTemplate jdbcTemplate;

    public NotebookSchemaMigrator(DataSource dataSource, JdbcTemplate jdbcTemplate) {
        this.dataSource = dataSource;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        dropColumnIfPresent("notebook_user", "display_name", "ALTER TABLE notebook_user DROP COLUMN display_name");
        addColumnIfMissing("note", "rich_content", "ALTER TABLE note ADD COLUMN rich_content LONGTEXT NULL");
        addColumnIfMissing("note", "favorite", "ALTER TABLE note ADD COLUMN favorite TINYINT(1) NOT NULL DEFAULT 0");
        addColumnIfMissing("notebook_user", "username_last_changed_at",
                "ALTER TABLE notebook_user ADD COLUMN username_last_changed_at DATETIME(3) NULL");
    }

    private void addColumnIfMissing(String tableName, String columnName, String alterSql) throws Exception {
        try (Connection connection = dataSource.getConnection();
             ResultSet columns = connection.getMetaData().getColumns(null, null, tableName, columnName)) {
            if (!columns.next()) {
                jdbcTemplate.execute(alterSql);
            }
        }
    }

    private void dropColumnIfPresent(String tableName, String columnName, String alterSql) throws Exception {
        try (Connection connection = dataSource.getConnection();
             ResultSet columns = connection.getMetaData().getColumns(null, null, tableName, columnName)) {
            if (columns.next()) {
                jdbcTemplate.execute(alterSql);
            }
        }
    }
}
