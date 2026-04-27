package redlib.backend;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan({"redlib.backend.mapper", "redlib.backend.dao"})
public class WebBackendApplication {
    public static void main(String[] args) {
        SpringApplication.run(WebBackendApplication.class, args);
    }
}