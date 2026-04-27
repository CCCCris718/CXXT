package redlib.backend.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import redlib.backend.annotation.Privilege;
import redlib.backend.dto.NotebookCategoryDTO;
import redlib.backend.dto.query.NotebookCategoryQueryDTO;
import redlib.backend.service.NotebookCategoryService;
import redlib.backend.vo.NotebookCategoryVO;

import java.util.List;

@RestController
@RequestMapping("/api/notebook/categories")
public class NotebookCategoryController {
    @Autowired
    private NotebookCategoryService notebookCategoryService;

    @PostMapping("list")
    @Privilege
    public List<NotebookCategoryVO> list(@RequestBody(required = false) NotebookCategoryQueryDTO queryDTO) {
        return notebookCategoryService.list(queryDTO);
    }

    @PostMapping("add")
    @Privilege
    public Integer add(@RequestBody NotebookCategoryDTO categoryDTO) {
        return notebookCategoryService.add(categoryDTO);
    }

    @PostMapping("update")
    @Privilege
    public Integer update(@RequestBody NotebookCategoryDTO categoryDTO) {
        return notebookCategoryService.update(categoryDTO);
    }

    @PostMapping("delete")
    @Privilege
    public void delete(@RequestBody List<Integer> ids) {
        notebookCategoryService.delete(ids);
    }
}
