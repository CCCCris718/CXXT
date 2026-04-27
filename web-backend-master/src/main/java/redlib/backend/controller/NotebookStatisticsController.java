package redlib.backend.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import redlib.backend.annotation.Privilege;
import redlib.backend.service.NotebookStatisticsService;
import redlib.backend.vo.NotebookCategoryStatVO;

import java.util.List;

@RestController
@RequestMapping("/api/notebook/statistics")
public class NotebookStatisticsController {
    @Autowired
    private NotebookStatisticsService notebookStatisticsService;

    @GetMapping("categoryCounts")
    @Privilege
    public List<NotebookCategoryStatVO> categoryCounts() {
        return notebookStatisticsService.categoryCounts();
    }
}
