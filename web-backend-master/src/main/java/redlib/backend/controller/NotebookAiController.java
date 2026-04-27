package redlib.backend.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import redlib.backend.annotation.Privilege;
import redlib.backend.dto.NotebookSummarizeRequestDTO;
import redlib.backend.dto.NotebookTranslateRequestDTO;
import redlib.backend.service.NotebookAiFacadeService;
import redlib.backend.vo.NotebookTextResultVO;

@RestController
@RequestMapping("/api/notebook/ai")
public class NotebookAiController {
    @Autowired
    private NotebookAiFacadeService notebookAiFacadeService;

    @PostMapping("translate")
    @Privilege
    public NotebookTextResultVO translate(@RequestBody NotebookTranslateRequestDTO requestDTO) {
        return new NotebookTextResultVO(notebookAiFacadeService.translate(requestDTO));
    }

    @PostMapping("summarize")
    @Privilege
    public NotebookTextResultVO summarize(@RequestBody NotebookSummarizeRequestDTO requestDTO) {
        return new NotebookTextResultVO(notebookAiFacadeService.summarize(requestDTO));
    }

    @PostMapping("transcribe")
    @Privilege
    public NotebookTextResultVO transcribe(@RequestParam("file") MultipartFile file, @RequestParam(required = false) String language) {
        return new NotebookTextResultVO(notebookAiFacadeService.transcribe(file, language));
    }
}
