package redlib.backend.service;

import org.springframework.web.multipart.MultipartFile;

public interface SpeechToTextService {
    String transcribe(MultipartFile file, String language);
}
