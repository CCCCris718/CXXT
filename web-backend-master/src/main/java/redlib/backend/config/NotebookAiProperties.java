package redlib.backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "notebook.ai")
@Data
public class NotebookAiProperties {
    private boolean enabled;
    private String provider;
    private String baseUrl;
    private String apiKey;
    private String translationModel;
    private String summaryModel;
    private String transcriptionModel;
    private long maxAudioSizeBytes = 10 * 1024 * 1024L;
}
