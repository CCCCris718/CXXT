package redlib.backend.service.ai;

import org.springframework.web.multipart.MultipartFile;
import redlib.backend.config.NotebookAiProperties;

public interface NotebookAiProvider {
    String getProviderName();

    String translate(String text, String sourceLanguage, String targetLanguage, NotebookAiProperties properties);

    String summarize(String text, Integer maxLength, NotebookAiProperties properties);

    String transcribe(MultipartFile file, String language, NotebookAiProperties properties);
}
