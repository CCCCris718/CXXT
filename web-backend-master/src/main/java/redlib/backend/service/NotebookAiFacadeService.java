package redlib.backend.service;

import org.springframework.web.multipart.MultipartFile;
import redlib.backend.dto.NotebookSummarizeRequestDTO;
import redlib.backend.dto.NotebookTranslateRequestDTO;

public interface NotebookAiFacadeService {
    String translate(NotebookTranslateRequestDTO requestDTO);

    String summarize(NotebookSummarizeRequestDTO requestDTO);

    String transcribe(MultipartFile file, String language);
}
